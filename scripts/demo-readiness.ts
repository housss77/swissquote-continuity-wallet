// Read-only: no account, private key, signing, paymaster quote or broadcast APIs.
async function main(){
 try {process.loadEnvFile('.env.local')}catch{/* Public RPC fallback; missing configuration is reported. */}
 try {const {demoReadiness}=await import('../lib/demo-check');const report=await demoReadiness();for(const c of report.checks)process.stdout.write(`${c.status}  ${c.name}: ${c.detail}\n`);process.stdout.write(`${report.status}  Readiness checked ${report.checkedAt}\n`);if(report.status==='FAIL')process.exitCode=1}
 catch {process.stderr.write('FAIL  Read-only readiness could not run. No operation was signed or submitted.\n');process.exitCode=1}
}
void main()
