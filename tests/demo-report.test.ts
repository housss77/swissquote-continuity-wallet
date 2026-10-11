import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseDemoReport} from '../lib/demo-report'
test('unavailable or malformed live demo responses do not become verified state',()=>{
 const report={status:'WARN',checkedAt:'2026-10-11T04:00:00Z',checks:[],usdcBalance:'0',ethBalance:'0'}
 assert.equal(parseDemoReport(report).usdcBalance,'0')
 for(const change of [{usdcBalance:'not a number'},{checks:null},{status:'success'},{checkedAt:'invalid'},{checks:[{name:'RPC',detail:'Unavailable',status:'success'}]}])assert.throws(()=>parseDemoReport({...report,...change}),/UNAVAILABLE/)
})
