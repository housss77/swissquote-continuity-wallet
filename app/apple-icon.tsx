import {ImageResponse} from 'next/og'
export const size={width:180,height:180},contentType='image/png'
export default function Icon(){return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#202225',color:'#f17236',fontSize:120,fontWeight:700}}>C</div>,size)}
