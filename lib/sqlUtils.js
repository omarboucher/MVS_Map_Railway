/**
 * Replace <TOKEN> placeholders in a config object's fields with values from process.env.
 *
 * @param {object} Config  - The config object to mutate.
 * @param {string[]} aFields - The field names to check for tokens.
 * @param {object} [env]   - An env object (defaults to process.env). Pass a plain object in tests.
 */
function readFromEnv (Config, aFields, env)
{
   const pEnv = env || process.env;

   for (let i = 0; i < aFields.length; i++)
   {
      const sField = aFields[i];
      if (typeof Config[sField] !== 'string') continue;

      const match = Config[sField].match (/<([^>]+)>/);
      if (match)
      {
         Config[sField] = pEnv[match[1]];
      }
   }
}

/**
 * Parse a MySQL SQL script that may contain DELIMITER commands.
 * Returns an array of individual SQL statement strings (without trailing delimiters).
 *
 * @param {string} sSQLContent - The full SQL script text.
 * @returns {string[]} Array of SQL statements.
 */
function parseSQLWithDelimiters (sSQLContent)
{
   const aStatements = [];
   let sCurrentDelimiter = ';';
   const aLines = sSQLContent.split (/\r?\n/);
   let sCurrentStatement = '';

   for (let i = 0; i < aLines.length; i++)
   {
      const sLine = aLines[i];
      const sTrimmedLine = sLine.trim ();

      // Check for DELIMITER command (must be at start of line, case-insensitive)
      const nDelimiterMatch = sTrimmedLine.match (/^DELIMITER\s+(.+)$/i);

      if (nDelimiterMatch)
      {
         // If we have accumulated a statement, save it before changing delimiter
         if (sCurrentStatement.trim ().length > 0)
         {
            const sStatement = sCurrentStatement.trim ();
            if (!sStatement.match (/^--/))
            {
               aStatements.push (sStatement);
            }
            sCurrentStatement = '';
         }

         // Update delimiter (remove quotes if present)
         sCurrentDelimiter = nDelimiterMatch[1].trim ().replace (/^['"]|['"]$/g, '');
         continue;
      }

      // Add line to current statement
      if (sCurrentStatement.length > 0)
      {
         sCurrentStatement += '\n' + sLine;
      }
      else
      {
         sCurrentStatement = sLine;
      }

      // Check if current statement ends with the delimiter
      const nDelimiterIndex = sCurrentStatement.lastIndexOf (sCurrentDelimiter);
      if (nDelimiterIndex !== -1)
      {
         const sAfterDelimiter = sCurrentStatement.substring (nDelimiterIndex + sCurrentDelimiter.length).trim ();

         if (sAfterDelimiter.length === 0 || /^[\r\n\s]*$/.test (sAfterDelimiter))
         {
            const sStatement = sCurrentStatement.substring (0, nDelimiterIndex).trim ();

            if (sStatement.length > 0 && !sStatement.match (/^--/))
            {
               aStatements.push (sStatement);
            }

            sCurrentStatement = '';
         }
      }
   }

   // Add any remaining statement
   if (sCurrentStatement.trim ().length > 0)
   {
      const sStatement = sCurrentStatement.trim ();
      if (!sStatement.match (/^--/))
      {
         aStatements.push (sStatement);
      }
   }

   return aStatements;
}

module.exports = { parseSQLWithDelimiters, readFromEnv };
