const { MVHANDLER } = require ('@metaversalcorp/mvsf');

var g_pMVSQL = null;

class HndlrHealth extends MVHANDLER
{
   constructor ()
   {
      super
      (
         'health',
         {
            'status': {
               sCB: 'Status'
            }
         },
         null,
         null,
         null
      );
   }

   async Status (pConn, Session, pData, fnRSP, fn)
   {
      let dbStatus = 'unconfigured';

      if (g_pMVSQL)
      {
         try
         {
            const Query = g_pMVSQL.Compose ('SELECT 1', {}, [], Session.sIPAddress);

            if (Query)
            {
               await g_pMVSQL.Exec (Query);
               dbStatus = 'ok';
            }
            else
            {
               dbStatus = 'error';
            }
         }
         catch (err)
         {
            dbStatus = 'error';
         }
      }

      fnRSP (fn, { nResult: 0, status: 'ok', db: dbStatus, timestamp: new Date ().toISOString () });
   }
}

function InitHealth (pSQL)
{
   g_pMVSQL = pSQL;
}

module.exports          = HndlrHealth;
module.exports.InitHealth = InitHealth;
