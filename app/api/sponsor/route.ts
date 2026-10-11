import {rpcGateway} from '../../../lib/rpc-gateway'
export const runtime='nodejs'
export async function POST(request:Request){return rpcGateway(request,'sponsor')}
