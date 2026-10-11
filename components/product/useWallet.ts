'use client'
import {useCallback,useEffect,useState} from 'react'
import {readWallet,selectedSafe,selectSafe,type WalletView} from '../../lib/product'
import {friendlyError} from '../../lib/errors'
export function useWallet() {
  const [wallet,setWallet]=useState<WalletView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[safe,setSafe]=useState('')
  const refresh=useCallback(async(value?:string)=>{setLoading(true);setError('');try{const address=value || selectedSafe();if(!address){setWallet(null);return}setSafe(address);setWallet(await readWallet(address))}catch(e){setWallet(null);setError(friendlyError(e,'balance'))}finally{setLoading(false)}},[])
  useEffect(()=>{void refresh()},[refresh])
  const choose=async(value:string)=>{selectSafe(value);await refresh(value)}
  return {wallet,loading,error,safe,refresh,choose}
}
