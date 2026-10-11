export const runtime='nodejs'
export async function GET(){return Response.json({status:'ok',network:'Ethereum Sepolia',chainId:11155111,version:'mobile-passkey-demo'},{headers:{'Cache-Control':'no-store'}})}
