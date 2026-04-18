const { MVHANDLER } = require ('@metaversalcorp/mvsf');
const fs   = require ('fs');
const path = require ('path');

const OBJECTS_DIR = path.join (__dirname, '..', 'web', 'public', 'objects');

class HndlrAssets extends MVHANDLER
{
   constructor ()
   {
      super
      (
         'assets',
         {
            'list': {
               sCB: 'List'
            }
         },
         null,
         null,
         null
      );
   }

   List (pConn, Session, pData, fnRSP, fn)
   {
      fs.readdir (OBJECTS_DIR, (err, aFiles) =>
      {
         if (err)
         {
            console.error ('Error listing assets directory:', err);
            fnRSP (fn, { nResult: -1, aFiles: [] });
            return;
         }

         const aGLB = aFiles.filter (sFile => /\.(glb|gltf)$/i.test (sFile));

         fnRSP (fn, { nResult: 0, aFiles: aGLB });
      });
   }
}

module.exports = HndlrAssets;
