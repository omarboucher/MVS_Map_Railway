# MVS_Map_Railway

Deploy a Metaverse Server on Railway.

## Server Setup

### Prerequisites

- Node.js (v14 or higher recommended)
- MySQL database server
- Access to RP1 Developer Center (RP1 Developer Account + Company ID)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:

   Copy `.env.example` to `.env` and fill in your values, **or** set the following environment variables directly:

   | Variable | Required | Description |
   |---|---|---|
   | `PORT` | ✅ | Server port number |
   | `MYSQLHOST` | ✅ | MySQL database host |
   | `MYSQLPORT` | ✅ | MySQL database port |
   | `MYSQLUSER` | ✅ | MySQL database username |
   | `MYSQLPASSWORD` | ✅ | MySQL database password |
   | `MYSQLDATABASE` | ✅ | MySQL database name |
   | `COMPANY_ID` | ✅ | Your RP1 Developer Center Company ID (lowercase) |
   | `PUBLIC_DOMAIN` | Optional | Public domain for your deployment (e.g., `myapp.railway.app`). Falls back to `RAILWAY_PUBLIC_DOMAIN` if not set (Railway injects this automatically). |

   The server will **fail to start** if any required variable is missing.

3. Start the server:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

4. Run tests:
   ```bash
   npm test
   ```

### Database Initialization

The server will automatically initialize the database on first run. It will:
- Create the `MVD_RP1_Map` database if it doesn't exist
- Import the schema from `MVD_RP1_Map.sql`
- Set up initial data
- Apply any pending database migrations from the `migrations/` directory on every startup

## Configuration

### Fabric Configuration (`fabric.msf.json`)

The `web/public/config/fabric.msf.json` file is **generated automatically** at server startup from the template `web/public/config/fabric.msf.json.template`.

You do **not** need to edit `fabric.msf.json` manually. Instead, set the `COMPANY_ID` environment variable to your RP1 Developer Center Company ID (lowercase).

The template uses two placeholders that are replaced at startup:
- `<COMPANY_ID>` → the value of the `COMPANY_ID` environment variable
- `<PUBLIC_DOMAIN>` → the value of `PUBLIC_DOMAIN` (or `RAILWAY_PUBLIC_DOMAIN`)

If you need to customise the fabric configuration further, edit `web/public/config/fabric.msf.json.template`.

## Project Structure

- `server.js` - Main server entry point
- `settings.json` - Server and database configuration
- `handler.json` - Request handler configuration
- `lib/` - Shared utilities (used by server and tests)
- `Handlers/` - Custom request handlers
- `migrations/` - Incremental SQL migration scripts (see `migrations/README.md`)
- `tests/` - Unit tests (Jest)
- `web/admin/` - Admin interface files
- `web/public/` - Public web files and assets
- `web/public/config/fabric.msf.json.template` - Fabric configuration template

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health/status` | Server + database health check |
| `GET` | `/assets/list` | List available GLB/GLTF asset files |

## Attaching Server to RP1

After your server is properly configured, deployed and running, you need to get the public URL path to your `fabric.msf.json` file to attach your server to RP1.

The URL path will be:
```
https://<YOUR_PUBLIC_DOMAIN>/config/fabric.msf.json
```

Replace `<YOUR_PUBLIC_DOMAIN>` with your actual public domain (the value you set in `PUBLIC_DOMAIN` environment variable or your deployment URL).

**Example:**
- If your `PUBLIC_DOMAIN` is `myapp.railway.app`, the URL would be:
  ```
  https://myapp.railway.app/config/fabric.msf.json
  ```

Use this URL in the RP1 Developer Center to attach your Fabric to RP1.

## License

ISC
