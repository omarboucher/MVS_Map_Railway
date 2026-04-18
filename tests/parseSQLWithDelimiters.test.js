'use strict';

const { parseSQLWithDelimiters } = require ('../lib/sqlUtils');

describe ('parseSQLWithDelimiters', () => {

   test ('parses single simple statement', () => {
      const sql = 'SELECT 1;';
      expect (parseSQLWithDelimiters (sql)).toEqual (['SELECT 1']);
   });

   test ('parses multiple simple statements', () => {
      const sql = 'SELECT 1;\nSELECT 2;\n';
      expect (parseSQLWithDelimiters (sql)).toEqual (['SELECT 1', 'SELECT 2']);
   });

   test ('skips comment-only statements (terminated by a semicolon)', () => {
      // A comment line that ends with ; is treated as a statement, but filtered by the ^-- check
      const sql = '-- this is a comment;\nSELECT 1;';
      const result = parseSQLWithDelimiters (sql);
      expect (result).not.toContain ('-- this is a comment');
      expect (result).toContain ('SELECT 1');
   });

   test ('handles DELIMITER change for stored procedures', () => {
      const sql = [
         'DELIMITER $$',
         'CREATE PROCEDURE foo ()',
         'BEGIN',
         '  SELECT 1;',
         'END$$',
         'DELIMITER ;',
         'SELECT 2;'
      ].join ('\n');

      const result = parseSQLWithDelimiters (sql);

      expect (result.length).toBe (2);
      expect (result[0]).toContain ('CREATE PROCEDURE foo');
      expect (result[1]).toBe ('SELECT 2');
   });

   test ('handles quoted DELIMITER', () => {
      const sql = "DELIMITER '$$'\nSELECT 1$$\nDELIMITER ;\nSELECT 2;";
      const result = parseSQLWithDelimiters (sql);

      expect (result).toContain ('SELECT 1');
      expect (result).toContain ('SELECT 2');
   });

   test ('returns empty array for empty input', () => {
      expect (parseSQLWithDelimiters ('')).toEqual ([]);
   });

   test ('returns empty array for whitespace-only input', () => {
      expect (parseSQLWithDelimiters ('   \n  \n  ')).toEqual ([]);
   });

   test ('handles statement with no trailing newline', () => {
      const sql = 'SELECT 42';
      const result = parseSQLWithDelimiters (sql);
      expect (result).toEqual (['SELECT 42']);
   });

   test ('handles Windows-style line endings (CRLF)', () => {
      const sql = 'SELECT 1;\r\nSELECT 2;\r\n';
      expect (parseSQLWithDelimiters (sql)).toEqual (['SELECT 1', 'SELECT 2']);
   });

   test ('preserves multi-line statements', () => {
      const sql = 'CREATE TABLE foo (\n  id INT NOT NULL\n);';
      const result = parseSQLWithDelimiters (sql);
      expect (result.length).toBe (1);
      expect (result[0]).toContain ('CREATE TABLE foo');
      expect (result[0]).toContain ('id INT NOT NULL');
   });

   test ('handles DELIMITER with leading/trailing whitespace', () => {
      const sql = 'DELIMITER  $$ \nSELECT 1$$\nDELIMITER ;';
      const result = parseSQLWithDelimiters (sql);
      expect (result).toContain ('SELECT 1');
   });

   test ('does not include DELIMITER lines in output', () => {
      const sql = 'DELIMITER $$\nSELECT 1$$\nDELIMITER ;';
      const result = parseSQLWithDelimiters (sql);
      expect (result.every (s => !s.startsWith ('DELIMITER'))).toBe (true);
   });
});
