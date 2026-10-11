import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const root=process.cwd(),output=path.join(root,'.next','standalone')
if(!fs.existsSync(path.join(output,'server.js')))throw new Error('Run npm run build before starting the production app.')
try{process.loadEnvFile(path.join(root,'.env.local'))}catch{/* Hosted environment supplies runtime secrets. */}
// Keep the existing registry outside build output even though Next standalone
// changes its working directory. Never copy any environment file into output.
process.env.CONTINUITY_DATA_DIR=path.resolve(root,process.env.CONTINUITY_DATA_DIR || '.recovery-data')
process.env.HOSTNAME=process.argv.includes('--host')?'0.0.0.0':'localhost'
process.env.PORT ||= '3000'
process.env.NODE_ENV='production'
for(const [source,target] of [['public','public'],['.next/static','.next/static']]){
 const directory=path.join(root,source)
 if(fs.existsSync(directory))fs.cpSync(directory,path.join(output,target),{recursive:true})
}
await import(pathToFileURL(path.join(output,'server.js')).href)
