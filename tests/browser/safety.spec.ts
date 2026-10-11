import {test,expect} from '@playwright/test'
test('unsigned examples distinguish limited checks from an unlimited approval warning',async({page})=>{
 let requests=0
 await page.route('**/*',async route=>{if(route.request().method()==='POST')requests++;await route.continue()})
 await page.goto('/lab/safety')
 await expect(page.getByRole('heading',{name:'No issue detected by available checks'})).toBeVisible()
 await page.getByRole('button',{name:'Unlimited approval warning'}).click()
 await expect(page.getByRole('heading',{name:'Review recommended'})).toBeVisible()
 await expect(page.getByText(/Unlimited allowance lets/)).toBeVisible()
 await expect(page.getByText(/Sanctions: Not checked/)).toBeVisible()
 expect(requests).toBe(0)
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
