import {demoReadiness} from '../../../lib/demo-check'
export const runtime='nodejs'
export async function GET(){return Response.json(await demoReadiness(),{headers:{'Cache-Control':'no-store'}})}
