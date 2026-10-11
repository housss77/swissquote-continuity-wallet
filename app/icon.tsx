import {ImageResponse} from 'next/og'
export const size={width:512,height:512},contentType='image/png'
export default function Icon(){return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#202225',color:'#ffffff',fontSize:340,fontWeight:700}}><span style={{color:'#f17236'}}>C</span></div>,size)}
