import type {DemoReadiness} from './demo-check'
export function parseDemoReport(value:unknown):DemoReadiness {
  const report=value as DemoReadiness
  const number=(v:unknown)=>v===null || (typeof v==='string' && /^\d+$/.test(v))
  if(!report || !['PASS','WARN','FAIL'].includes(report.status) || typeof report.checkedAt!=='string' || Number.isNaN(Date.parse(report.checkedAt))
    || !Array.isArray(report.checks) || report.checks.length>30 || !number(report.usdcBalance) || !number(report.ethBalance)
    || report.checks.some(c=>!c || !['PASS','WARN','FAIL'].includes(c.status) || typeof c.name!=='string' || typeof c.detail!=='string'))throw new Error('DEMO_REPORT_UNAVAILABLE')
  return report
}
