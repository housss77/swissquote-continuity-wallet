import 'server-only'
import path from 'node:path'
// A persistent private volume is required in hosted deployments.
export const serverDataRoot = () => path.resolve(process.env.CONTINUITY_DATA_DIR || '.recovery-data')
