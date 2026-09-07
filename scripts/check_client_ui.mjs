import { resolve } from 'node:path';
const { _electron: electron } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repository = resolve(import.meta.dirname, '..');
import assert from 'node:assert/strict';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.env.PROTOTYPE_EXECUTABLE || resolve(repository, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:process.env.PROTOTYPE_EXECUTABLE?[]:['.'],cwd:repository,env});
const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const click=name=>page.getByRole('button',{name,exact:true}).click();
try {
await click('交互原型 · Mock');await click('重置演示数据');await click('确认重置');await page.getByRole('heading',{name:'与总管的对话',exact:true}).waitFor();
await page.getByRole('textbox').last().fill('请生成原型验收报告');await page.getByRole('textbox').last().press('Enter');
await page.getByText('固定 mock 数据',{exact:false}).first().waitFor({timeout:15000});
console.log('PASS mock response, auto task and delivery');
const openMenus=page.getByRole('button',{name:/打开方式/});await openMenus.first().click();await page.getByRole('menuitem',{name:/使用系统默认应用打开/}).click();await page.getByRole('dialog').getByText(/Mock 示例/).waitFor();await page.keyboard.press('Escape');
await page.getByRole('button',{name:/内容发布前确认/}).first().click();await click('确认操作');await page.getByText('固定 mock 数据',{exact:false}).first().waitFor();console.log('PASS seed approval and example preview');
await page.getByRole('button',{name:/客户材料分析/}).first().click();await click('按原事项重试');await page.getByText('固定 mock 数据',{exact:false}).first().waitFor({timeout:12000});console.log('PASS failure retry');
await click('通讯录');await page.waitForTimeout(300);console.log('CONTACT', (await page.locator('body').innerText()).slice(0,1700));
await click('招募');await page.getByRole('button',{name:/创建专家.*自定义身份/}).click();await page.getByLabel('名称',{exact:true}).fill('原型验收员');await page.getByLabel('职责',{exact:true}).fill('界面与交互验收');await page.getByLabel('职责说明',{exact:true}).fill('根据交付标准逐项检查界面与操作反馈，记录问题和验收结论。');
await click('继续');await page.getByLabel('System Prompt',{exact:true}).fill('你负责界面验收。逐项检查操作结果，保留异常记录，并形成可核验的结论。');await click('继续');await page.getByRole('button',{name:/多源网络调研/}).last().click();await click('创建专家');
await page.getByRole('button',{name:/原型验收员/}).first().waitFor();console.log('PASS employee create');
await click('能力');await page.waitForTimeout(200);console.log('CAPABILITY', (await page.locator('body').innerText()).slice(0,900));
await click('连接');await page.waitForTimeout(200);console.log('CONNECTION', (await page.locator('body').innerText()).slice(0,900));
await click('系统');for(const name of ['通用','总管','模型服务','资源与权限','记忆与存储','用量与预算','关于与诊断']) await page.getByRole('button',{name:new RegExp(name)}).first().click();
console.log('PASS five modules and all system sections');
await click('消息');await page.screenshot({path:'/tmp/client-prototype-verified.png'});
assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS no page errors');await click('交互原型 · Mock');await click('重置演示数据');await click('确认重置');
} catch(e){console.log('FAIL',e.message);console.log((await page.locator('body').innerText()).slice(-6000));await page.screenshot({path:'/tmp/client-prototype-failure.png'});process.exitCode=1} finally {await app.close()}
