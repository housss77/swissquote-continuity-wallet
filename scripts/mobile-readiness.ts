// Read-only deployment configuration and chain evidence checks. No signing,
// account generation, sponsorship quotes, broadcast or private-value output.
import fs from 'node:fs'
async function main(){
 try{process.loadEnvFile('.env.local')}catch{/* Deployment environment may already be populated. */}
 const {deploymentOrigin}=await import('../lib/app-origin'),{providerConfig}=await import('../lib/constants')
 let failed=false
 const emit=(status:'PASS'|'WARN'|'FAIL',name:string,detail:string)=>{console.log(`${status}  ${name}: ${detail}`);if(status==='FAIL')failed=true}
 try{const origin=deploymentOrigin(),host=new URL(origin).hostname;emit(origin.startsWith('https:')?'PASS':'WARN','Phone origin',origin.startsWith('https:')?'Fixed HTTPS origin configured.':'Localhost only; iPhone needs a stable HTTPS deployment.');emit(host==='localhost' || process.env.NEXT_PUBLIC_PASSKEY_RP_ID===host?'PASS':'FAIL','Passkey RP','Deployment hostname must match the public build-time RP setting.')}catch{emit('FAIL','Phone origin','APP_ORIGIN must be a fixed HTTPS root origin (localhost allowed for development).')}
 try{providerConfig(true);emit('PASS','Sponsorship configuration','Provider fields present; eligibility and quota are not inferred.')}catch{emit('FAIL','Sponsorship configuration','Required server provider configuration is missing or unsupported.')}
 emit(process.env.CONTINUITY_DATA_DIR && fs.existsSync(process.env.CONTINUITY_DATA_DIR)?'PASS':'WARN','Persistent storage','Single instance and a persistent writable disk are required. This check cannot establish host durability or permissions.')
 try{const {demoReadiness}=await import('../lib/demo-check'),report=await demoReadiness();for(const c of report.checks)emit(c.status,c.name,c.detail)}catch{emit('WARN','Sepolia reads','Read-only chain checks unavailable. Historical evidence remains historical.')}
 emit('WARN','Physical phone acceptance','A human must register and sign on the final HTTPS domain; virtual tests do not establish Face ID success.')
 if(failed)process.exitCode=1
}
void main().catch(()=>{console.error('FAIL  Readiness check unavailable. No transaction was signed or sent.');process.exitCode=1})
