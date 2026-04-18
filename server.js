const { MVSF                    } = require ('@metaversalcorp/mvsf');
const { InitSQL                 } = require ('./utils.js');
const { InitHealth              } = require ('./Handlers/Health.js');
const { parseSQLWithDelimiters  } = require ('./lib/sqlUtils.js');
const Settings      = require ('./settings.json');
const fs            = require ('fs');
const path          = require ('path');
const mysql         = require ('mysql2/promise');
const zlib          = require ('zlib');

const { MVSQL_MYSQL  } = require ('@metaversalcorp/mvsql_mysql');

// Required environment variables that must be present at startup
const REQUIRED_ENV_VARS = [ 'PORT', 'MYSQLHOST', 'MYSQLPORT', 'MYSQLUSER', 'MYSQLPASSWORD', 'MYSQLDATABASE' ];

/*******************************************************************************************************************************
**                                                     Main                                                                   **
*******************************************************************************************************************************/
class MVSF_Map
{
   #pServer;
   #pSQL;

   constructor ()
   {
      this.ValidateEnv ();
      this.ReadFromEnv (Settings.SQL.config, [ "host", "port", "user", "password", "database" ]);
      this.ReadFromEnv (Settings.Fabric,     [ "sCompanyId" ]);
      this.ProcessFabricConfig ();

      switch (Settings.SQL.type)
      {
      case 'MYSQL':
         this.#pSQL = new MVSQL_MYSQL (Settings.SQL.config, this.onSQLReady.bind (this));
         break;

      default:
         console.log ('No Database was configured for this service.');
         break;
      }
   }

   ValidateEnv ()
   {
      const aMissing = REQUIRED_ENV_VARS.filter (sVar => !process.env[sVar]);

      if (aMissing.length > 0)
      {
         console.error ('Missing required environment variables: ' + aMissing.join (', '));
         console.error ('Please set these variables before starting the server. See .env.example for reference.');
         process.exit (1);
      }
   }

   #GetToken (sToken)
   {
      if (typeof sToken !== 'string') return null;
      const match = sToken.match (/<([^>]+)>/);
      return match ? match[1] : null;
   }

   ReadFromEnv (Config, aFields)
   {
      let sValue;

      for (let i=0; i < aFields.length; i++)
      {
         if ((sValue = this.#GetToken (Config[aFields[i]])) != null)
            Config[aFields[i]] = process.env[sValue];
      }
   }

   ProcessFabricConfig ()
   {
      // Always read from the template so placeholders survive server restarts
      const sTemplatePath = path.join (__dirname, 'web', 'public', 'config', 'fabric.msf.json.template');
      const sFabricPath   = path.join (__dirname, 'web', 'public', 'config', 'fabric.msf.json');

      // Fall back to the main file if the template doesn't exist yet
      const sSourcePath = fs.existsSync (sTemplatePath) ? sTemplatePath : sFabricPath;

      try
      {
         let sContent = fs.readFileSync (sSourcePath, 'utf8');

         // Replace <PUBLIC_DOMAIN>: check PUBLIC_DOMAIN first, fallback to RAILWAY_PUBLIC_DOMAIN
         const sPublicDomain = process.env.PUBLIC_DOMAIN || process.env.RAILWAY_PUBLIC_DOMAIN || '';
         sContent = sContent.replace (/<PUBLIC_DOMAIN>/g, sPublicDomain);

         // Replace <COMPANY_ID> from environment or settings
         const sCompanyId = process.env.COMPANY_ID || Settings.Fabric.sCompanyId || '';
         sContent = sContent.replace (/<COMPANY_ID>/g, sCompanyId);

         fs.writeFileSync (sFabricPath, sContent, 'utf8');
      }
      catch (err)
      {
         console.log ('Error processing fabric.msf.json: ', err);
      }
   }

   async InitializeDatabase (pMVSQL)
   {
      const sDatabaseName = 'MVD_RP1_Map';
      const sSQLFile      = path.join (__dirname, 'MVD_RP1_Map.sql');
      const sSQLGzFile    = path.join (__dirname, 'MVD_RP1_Map.sql.gz');

      try
      {
         // Build a connection config from the already-resolved values (no placeholders remain)
         const pConfig = {
            host:               Settings.SQL.config.host,
            port:               Settings.SQL.config.port,
            user:               Settings.SQL.config.user,
            password:           Settings.SQL.config.password,
            multipleStatements: true
         };

         const pConnection = await mysql.createConnection (pConfig);

         // Check if database exists
         const [aRows] = await pConnection.execute (
            `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
            [sDatabaseName]
         );

         if (aRows.length === 0)
         {
            console.log (`Database '${sDatabaseName}' does not exist. Creating and importing...`);

            // Determine which SQL file to use
            let sSQLContent = null;
            if (fs.existsSync (sSQLFile))
            {
               sSQLContent = fs.readFileSync (sSQLFile, 'utf8');
            }
            else if (fs.existsSync (sSQLGzFile))
            {
               const aBuffer = fs.readFileSync (sSQLGzFile);
               sSQLContent = zlib.gunzipSync (aBuffer).toString ('utf8');
            }
            else
            {
               throw new Error (`Neither ${sSQLFile} nor ${sSQLGzFile} found`);
            }

            // Parse SQL respecting DELIMITER statements
            const aStatements = parseSQLWithDelimiters (sSQLContent);

            console.log (`Parsed ${aStatements.length} SQL statements. Executing...`);

            // Execute each statement
            for (let i = 0; i < aStatements.length; i++)
            {
               const sStatement = aStatements[i];

               // Skip empty statements and comments
               if (!sStatement || sStatement.trim ().length === 0 || sStatement.trim ().match (/^--/))
                  continue;

               try
               {
                  await pConnection.query (sStatement);

                  // Log progress for large imports
                  if ((i + 1) % 50 === 0)
                  {
                     console.log (`Executed ${i + 1}/${aStatements.length} statements...`);
                  }
               }
               catch (err)
               {
                  // Ignore errors for CREATE DATABASE if it already exists
                  if (err.code === 'ER_DB_CREATE_EXISTS' || err.message.includes ('already exists'))
                  {
                     // This is okay, continue
                  }
                  else
                  {
                     console.error (`Error executing statement ${i + 1}/${aStatements.length}:`, err.message);
                     console.error (`Statement preview:`, sStatement.substring (0, 200) + '...');
                     throw err;
                  }
               }
            }

            console.log (`Database '${sDatabaseName}' created and imported successfully.`);
         }
         else
         {
            console.log (`Database '${sDatabaseName}' already exists. Skipping initialization.`);
         }

         await pConnection.end ();
      }
      catch (err)
      {
         console.error ('Error initializing database:', err);
         throw err;
      }
   }

   async RunMigrations ()
   {
      const sMigrationsDir = path.join (__dirname, 'migrations');

      if (!fs.existsSync (sMigrationsDir))
         return;

      const pConfig = {
         host:     Settings.SQL.config.host,
         port:     Settings.SQL.config.port,
         user:     Settings.SQL.config.user,
         password: Settings.SQL.config.password,
         database: 'MVD_RP1_Map'
      };

      let pConnection;

      try
      {
         pConnection = await mysql.createConnection (pConfig);

         // Ensure the migrations tracking table exists
         await pConnection.query (`
            CREATE TABLE IF NOT EXISTS schema_migrations (
               version     INT           NOT NULL,
               applied_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
               description VARCHAR (255) NOT NULL DEFAULT '',
               CONSTRAINT PK_schema_migrations PRIMARY KEY (version)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
         `);

         // Fetch already-applied versions
         const [aApplied] = await pConnection.query ('SELECT version FROM schema_migrations ORDER BY version ASC');
         const aAppliedSet = new Set (aApplied.map (r => r.version));

         // Read migration files sorted by version number
         const aFiles = fs.readdirSync (sMigrationsDir)
            .filter  (sFile => /^\d+_.+\.sql$/i.test (sFile))
            .sort ();

         for (const sFile of aFiles)
         {
            const nVersion = parseInt (sFile, 10);

            if (aAppliedSet.has (nVersion))
               continue;

            console.log (`Applying migration: ${sFile}`);

            const sSQLContent = fs.readFileSync (path.join (sMigrationsDir, sFile), 'utf8');
            const aStatements = parseSQLWithDelimiters (sSQLContent);

            for (const sStatement of aStatements)
            {
               if (!sStatement || sStatement.trim ().length === 0 || sStatement.trim ().match (/^--/))
                  continue;

               await pConnection.query (sStatement);
            }

            const sDescription = sFile.replace (/^\d+_/, '').replace (/\.sql$/i, '');
            await pConnection.query (
               'INSERT INTO schema_migrations (version, description) VALUES (?, ?)',
               [nVersion, sDescription]
            );

            console.log (`Migration ${nVersion} applied successfully.`);
         }
      }
      catch (err)
      {
         console.error ('Error running migrations:', err);
         throw err;
      }
      finally
      {
         if (pConnection) await pConnection.end ();
      }
   }

   async onSQLReady (pMVSQL, err)
   {
      if (pMVSQL)
      {
         try
         {
            // Initialize database if it doesn't exist, then apply pending migrations
            await this.InitializeDatabase (pMVSQL);
            await this.RunMigrations ();

            this.ReadFromEnv (Settings.MVSF, [ "nPort" ]);

            this.#pServer = new MVSF (Settings.MVSF, require ('./handler.json'), __dirname, null, 'application/json');
            this.#pServer.LoadHtmlSite (__dirname, [ './web/admin', './web/public']);
            this.#pServer.Run ();

            console.log ('SQL Server READY');
            InitSQL    (pMVSQL, this.#pServer, Settings.Info || null);
            InitHealth (pMVSQL);

            this.RegisterShutdown ();
         }
         catch (initErr)
         {
            console.error ('Error during database initialization:', initErr);
            console.log ('SQL Server Connect Error: ', initErr);
         }
      }
      else
      {
         console.log ('SQL Server Connect Error: ', err);
      }
   }

   RegisterShutdown ()
   {
      const Shutdown = (sSignal) =>
      {
         console.log (`Received ${sSignal}. Shutting down gracefully...`);
         process.exit (0);
      };

      process.once ('SIGTERM', () => Shutdown ('SIGTERM'));
      process.once ('SIGINT',  () => Shutdown ('SIGINT'));
   }
}

const g_pServer = new MVSF_Map ();
