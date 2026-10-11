import type {MetadataRoute} from 'next'
export default function manifest():MetadataRoute.Manifest {
  return {id:'/',name:'Continuity Wallet',short_name:'Continuity',description:'Passkey self-custody and sponsored Sepolia transactions. Hackathon concept.',start_url:'/login',scope:'/',display:'standalone',background_color:'#f7f7f5',theme_color:'#f7f7f5',icons:[{src:'/icon',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/apple-icon',sizes:'180x180',type:'image/png'}]}
}
