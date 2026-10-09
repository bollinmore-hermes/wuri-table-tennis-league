'use strict';
const path=require('node:path');require('esbuild').buildSync({entryPoints:[require.resolve('qrcode/lib/browser.js')],bundle:true,minify:true,platform:'browser',globalName:'WuriQR',outfile:path.join(__dirname,'../assets/vendor/qrcode.js'),legalComments:'eof'});
const fs=require('node:fs');fs.writeFileSync(path.join(__dirname,'../assets/vendor/qrcode.LICENSE.txt'),fs.readFileSync(require.resolve('qrcode/license'),'utf8').trimEnd()+'\n');
