const fs   = require ('node:fs');
const path = require ('node:path');

var g_pMVSQL  = null;
var g_pServer = null;
var g_pInfo   = null;

var g_nTimeout    = 0;
var g_nInterval   = 0;


/*******************************************************************************************************************************
**                                                   Imported Functions                                                       **
*******************************************************************************************************************************/

function MemResult (pResult, result)
{
   pResult.nResult = result.output.nResult;

   if (pResult.nResult == 0)
   {
      pResult.Parent = JSON.parse (result.recordsets[0][0].Object);
      pResult.aChild = [];

      for (let i=1; i < result.recordsets.length; i++)
      {
         pResult.aChild[i-1] = [];
         for (let j=0; j < result.recordsets[i].length; j++)
         {
            pResult.aChild[i-1].push (JSON.parse (result.recordsets[i][j].Object));
         }
      }
   }
   else RawResult (pResult, result);
}

function RawResult (pResult, result)
{
   pResult.nResult = result.output.nResult;
   pResult.aResultSet = result.recordsets;
}

/*******************************************************************************************************************************
**                                                   Exported Functions                                                       **
*******************************************************************************************************************************/

function RunQuery (Session, pData, fnRSP, fn, pSQLData)
{
   let pResult = { nResult: -1, aResultSet: [] };

   const Query = g_pMVSQL.Compose (pSQLData.sProc, pData, pSQLData.aData, Session.sIPAddress);

   if (Query)
   {
      g_pMVSQL.Exec (Query).then
      (
         (result) =>
         {
            if (result != null)
            {
               if (pSQLData.Param == 0)
                  MemResult (pResult, result);
               else
                  RawResult (pResult, result);
            }

            fnRSP (fn, pResult);
         }
      ).catch
      (
         (err) =>
         {
            console.error ('RunQuery error [' + pSQLData.sProc + ']:', err.message);
            pResult.nResult = -1;
            fnRSP (fn, pResult);
         }
      );
   }
   else fnRSP (fn, pResult);
}

function RunQuery2Ex (Session, pData, fnRSP, fn, bRecover, pSQLData)
{
   let pResult = { nResult: -1, aResultSet: [] };

   const Query = g_pMVSQL.Compose (pSQLData.sProc, pData, pSQLData.aData, Session.sIPAddress, (Session.twRPersonaIx ? Session.twRPersonaIx : 1), 2);

   if (Query)
   {
      g_pMVSQL.Exec (Query).then
      (
         (result) =>
         {
            if (result != null)
            {
               if (bRecover && result.output.nResult == 0)
               {
                  const pObjectHead = JSON.parse (result.recordsets[0][0].Object).pObjectHead;

                  let sChannelName = pObjectHead.wClass_Object + '-' + pObjectHead.twObjectIx;

                  Session.socket.join (sChannelName);
                  Session.socket.emit ('recover',
                     {
                        nResult:    result.output.nResult,
                        aResultSet: result.recordsets,
                     }
                  );
               }
               else
               {
                  if (pSQLData.Param == 0)
                     MemResult (pResult, result);
                  else
                     RawResult (pResult, result);
               }

               pResult.nResult = result.output.nResult;
            }

            fnRSP (fn, pResult);
         }
      ).catch
      (
         (err) =>
         {
            console.error ('RunQuery2Ex error [' + pSQLData.sProc + ']:', err.message);
            pResult.nResult = -1;
            fnRSP (fn, pResult);
         }
      );
   }
   else fnRSP (fn, pResult);
}

function RunQuery2 (Session, pData, fnRSP, fn, pSQLData)
{
   RunQuery2Ex (Session, pData, fnRSP, fn, false, pSQLData);
}

/*******************************************************************************************************************************
**                                                     Initialization                                                         **
*******************************************************************************************************************************/

function EventQueue (pServer)
{
   g_nTimeout = 0;

   let Query = g_pMVSQL.ComposeETL ('etl_Events');

   g_pMVSQL.Exec (Query).then
   (
      (result) =>
      {
         if (result != null && result.output.nResult == 0 && result.recordsets.length == 2)
         {
            let aRow = result.recordsets[0];

            for (let i=0; i < aRow.length; i++)
            {
               const pObject = JSON.parse (aRow[i].Object);

               // Target the specific object's room; fall back to global broadcast
               const pControl      = pObject.pControl || pObject.pObjectHead;
               const sChannelName  = (pControl && pControl.wClass_Object && pControl.twObjectIx)
                                       ? pControl.wClass_Object + '-' + pControl.twObjectIx
                                       : 'GLOBALREFRESH';

               g_pServer.io.in (sChannelName).emit ('refresh', pObject);
            }

            if (result.recordsets[1][0].nCount > 0)
            {
               setTimeout (EventQueue, 0);
            }
         }
      }
   );
}

function EventFetch ()
{
   if (g_nTimeout == 0)
   {
      g_nTimeout = setTimeout (EventQueue, 100);
   }
}

function Test (fn, Result)
{
   console.log ('Result: ', Result);
}

function InitSQL (pSQL, pServer, pInfo)
{
   g_pMVSQL  = pSQL;
   g_pServer = pServer;
   g_pInfo   = pInfo;

   g_nInterval = setInterval (EventFetch, 1000);

   // Clear the polling interval on graceful shutdown
   process.once ('SIGTERM', StopEventLoop);
   process.once ('SIGINT',  StopEventLoop);
}

function StopEventLoop ()
{
   if (g_nInterval !== 0)
   {
      clearInterval (g_nInterval);
      g_nInterval = 0;
   }

   if (g_nTimeout !== 0)
   {
      clearTimeout (g_nTimeout);
      g_nTimeout = 0;
   }
}

function GetInfo (sEntry, twObjectIx, fnRSP, fn)
{
   if (!g_pInfo)
   {
      fnRSP (fn, { nResult: -2 });
      return;
   }

   // Sanitize: sEntry must be a plain alphanumeric identifier (no path separators)
   if (typeof sEntry !== 'string' || !/^[A-Za-z0-9_-]+$/.test (sEntry))
   {
      fnRSP (fn, { nResult: -3 });
      return;
   }

   const sObjectIx = String (twObjectIx).padStart (10, '0');

   const sFileName = path.join (
      g_pInfo[sEntry],
      sEntry,
      sObjectIx.slice (0, 1),
      sObjectIx.slice (1, 4),
      sObjectIx.slice (4, 7),
      sObjectIx + '.json'
   );

   // Ensure the resolved path stays within the expected base directory
   const sBase = path.resolve (g_pInfo[sEntry]);
   const sResolved = path.resolve (sFileName);

   if (!sResolved.startsWith (sBase + path.sep) && sResolved !== sBase)
   {
      fnRSP (fn, { nResult: -3 });
      return;
   }

   fs.readFile (sFileName, 'utf8', (err, data) => {
      if (err)
      {
         fnRSP (fn, { nResult: -1 });
      }
      else
      {
         fnRSP (fn, { nResult: 0, sData: data });
      }
   });
}

module.exports =
{
   RunQuery,
   RunQuery2,
   RunQuery2Ex,
   InitSQL,
   StopEventLoop,
   GetInfo
}
