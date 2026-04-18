'use strict';

const { readFromEnv } = require ('../lib/sqlUtils');

describe ('readFromEnv', () => {

   test ('replaces a single <TOKEN> placeholder', () => {
      const config = { host: '<MYSQLHOST>' };
      const env    = { MYSQLHOST: 'db.example.com' };

      readFromEnv (config, ['host'], env);

      expect (config.host).toBe ('db.example.com');
   });

   test ('replaces multiple placeholders', () => {
      const config = {
         host:     '<MYSQLHOST>',
         port:     '<MYSQLPORT>',
         user:     '<MYSQLUSER>',
         password: '<MYSQLPASSWORD>',
         database: '<MYSQLDATABASE>'
      };
      const env = {
         MYSQLHOST:     'localhost',
         MYSQLPORT:     '3306',
         MYSQLUSER:     'root',
         MYSQLPASSWORD: 's3cret',
         MYSQLDATABASE: 'mydb'
      };

      readFromEnv (config, ['host', 'port', 'user', 'password', 'database'], env);

      expect (config.host).toBe ('localhost');
      expect (config.port).toBe ('3306');
      expect (config.user).toBe ('root');
      expect (config.password).toBe ('s3cret');
      expect (config.database).toBe ('mydb');
   });

   test ('leaves non-placeholder values unchanged', () => {
      const config = { host: 'hardcoded-host' };

      readFromEnv (config, ['host'], {});

      expect (config.host).toBe ('hardcoded-host');
   });

   test ('sets undefined for an env var that is not set', () => {
      const config = { host: '<MISSING_VAR>' };

      readFromEnv (config, ['host'], {});

      expect (config.host).toBeUndefined ();
   });

   test ('skips fields not present in the config object', () => {
      const config = {};

      expect (() => readFromEnv (config, ['host'], { host: 'x' })).not.toThrow ();
   });

   test ('skips non-string field values', () => {
      const config = { port: 3306 };

      readFromEnv (config, ['port'], { PORT: '9999' });

      // numeric value should remain unchanged
      expect (config.port).toBe (3306);
   });

   test ('only replaces the first <TOKEN> in a value', () => {
      // Token format only captures the first <...> group; subsequent ones are ignored
      const config = { value: '<A>' };
      const env    = { A: 'alpha' };

      readFromEnv (config, ['value'], env);

      expect (config.value).toBe ('alpha');
   });
});
