async function CoolPropModule(moduleArg={}){var moduleRtn;(function(){function a(d){d=d.split("-")[0];for(d=d.split(".").slice(0,3);3>d.length;)d.push("00");d=d.map(e=>e.padStart(2,"0"));return d.join("")}var b="undefined"!==typeof process&&process.versions?.node?a(process.versions.node):2147483647;if(16E4>b)throw Error(`This emscripten-generated code requires node v${"16.0.0"} (detected v${[b/1E4|0,(b/100|0)%100,b%100].join(".")})`);if(b="undefined"!==typeof navigator&&navigator.userAgent){var c=b.includes("Safari/")&&!b.includes("Chrome/")&&b.match(/Version\/(\d+\.?\d*\.?\d*)/)?
a(b.match(/Version\/(\d+\.?\d*\.?\d*)/)[1]):2147483647;if(15E4>c)throw Error(`This emscripten-generated code requires Safari v${"15.0.0"} (detected v${c})`);c=b.match(/Firefox\/(\d+(?:\.\d+)?)/)?parseFloat(b.match(/Firefox\/(\d+(?:\.\d+)?)/)[1]):2147483647;if(79>c)throw Error(`This emscripten-generated code requires Firefox v79 (detected v${c})`);b=b.match(/Chrome\/(\d+(?:\.\d+)?)/)?parseFloat(b.match(/Chrome\/(\d+(?:\.\d+)?)/)[1]):2147483647;if(85>b)throw Error(`This emscripten-generated code requires Chrome v85 (detected v${b})`);
}})();var m=moduleArg,aa=!!globalThis.window,ba=!!globalThis.WorkerGlobalScope,ca=globalThis.process?.versions?.node&&"renderer"!=globalThis.process?.type,da=!aa&&!ca&&!ba;if(ca){const {createRequire:a}=await import("module");var require=a(import.meta.url)}var ea="./this.program",fa=import.meta.url,ha="",ia,ja;
if(ca){if(!globalThis.process?.versions?.node||"renderer"==globalThis.process?.type)throw Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");var fs=require("fs");fa.startsWith("file:")&&(ha=require("path").dirname(require("url").fileURLToPath(fa))+"/");ja=a=>{a=ka(a)?new URL(a):a;a=fs.readFileSync(a);n(Buffer.isBuffer(a));return a};ia=async a=>{a=ka(a)?new URL(a):
a;a=fs.readFileSync(a,void 0);n(Buffer.isBuffer(a));return a};1<process.argv.length&&(ea=process.argv[1].replace(/\\/g,"/"));process.argv.slice(2)}else if(!da)if(aa||ba){try{ha=(new URL(".",fa)).href}catch{}if(!globalThis.window&&!globalThis.WorkerGlobalScope)throw Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");ba&&(ja=a=>{var b=new XMLHttpRequest;b.open("GET",
a,!1);b.responseType="arraybuffer";b.send(null);return new Uint8Array(b.response)});ia=async a=>{if(ka(a))return new Promise((c,d)=>{var e=new XMLHttpRequest;e.open("GET",a,!0);e.responseType="arraybuffer";e.onload=()=>{200==e.status||0==e.status&&e.response?c(e.response):d(e.status)};e.onerror=d;e.send(null)});var b=await fetch(a,{credentials:"same-origin"});if(b.ok)return b.arrayBuffer();throw Error(b.status+" : "+b.url);}}else throw Error("environment detection error");
var la=console.log.bind(console),p=console.error.bind(console);n(!da,"shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.");var ma;globalThis.WebAssembly||p("no native wasm support detected");var na=!1;function n(a,b){a||q("Assertion failed"+(b?": "+b:""))}var ka=a=>a.startsWith("file://");function oa(){var a=pa();n(0==(a&3));0==a&&(a+=4);r[a>>2]=34821223;r[a+4>>2]=2310721022;r[0]=1668509029}
function qa(){if(!na){var a=pa();0==a&&(a+=4);var b=r[a>>2],c=r[a+4>>2];34821223==b&&2310721022==c||q(`Stack overflow! Stack cookie has been overwritten at ${ra(a)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ra(c)} ${ra(b)}`);1668509029!=r[0]&&q("Runtime error: The application has corrupted its heap memory area (address zero)!")}}class u extends Error{}class sa extends u{constructor(a){super(a);this.L=a;a=ta(a);this.name=a[0];this.message=a[1]}}var ua=new Int16Array(1),va=new Int8Array(ua.buffer);
ua[0]=25459;115===va[0]&&99===va[1]||q("Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)");function wa(a){Object.getOwnPropertyDescriptor(m,a)||Object.defineProperty(m,a,{configurable:!0,set(){q(`Attempt to set \`Module.${a}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`)}})}
function w(a){return()=>n(!1,`call to '${a}' via reference taken before Wasm module initialization`)}
function xa(a){Object.getOwnPropertyDescriptor(m,a)||Object.defineProperty(m,a,{configurable:!0,get(){var b=`'${a}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;"FS_createPath"!==a&&"FS_createDataFile"!==a&&"FS_createPreloadedFile"!==a&&"FS_preloadFile"!==a&&"FS_unlink"!==a&&"addRunDependency"!==a&&"FS_createLazyFile"!==a&&"FS_createDevice"!==a&&"removeRunDependency"!==a||(b+=". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you");
q(b)}})}var ya,za,A,B,Aa,Ba,E,r,Ca,Da,Ea,Fa,Ga=!1;function Ha(){var a=Ia.buffer;A=new Int8Array(a);Aa=new Int16Array(a);B=new Uint8Array(a);Ba=new Uint16Array(a);E=new Int32Array(a);r=new Uint32Array(a);Ca=new Float32Array(a);Da=new Float64Array(a);Ea=new BigInt64Array(a);Fa=new BigUint64Array(a)}n(globalThis.Int32Array&&globalThis.Float64Array&&Int32Array.prototype.subarray&&Int32Array.prototype.set,"JS engine does not provide full typed array support");
function q(a){m.onAbort?.(a);a="Aborted("+a+")";p(a);na=!0;a=new WebAssembly.RuntimeError(a);za?.(a);throw a;}function Ja(){q("Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with -sFORCE_FILESYSTEM")}
function F(a,b){return(...c)=>{n(Ga,`native function \`${a}\` called before runtime initialization`);var d=Ka[a];n(d,`exported native function \`${a}\` not found`);n(c.length<=b,`native function \`${a}\` called with ${c.length} args but expects ${b}`);return d(...c)}}var La;async function Ma(a){if(!ma)try{var b=await ia(a);return new Uint8Array(b)}catch{}if(a==La&&ma)a=new Uint8Array(ma);else if(ja)a=ja(a);else throw"both async and sync fetching of the wasm failed";return a}
async function Na(a,b){try{var c=await Ma(a);return await WebAssembly.instantiate(c,b)}catch(d){p(`failed to asynchronously prepare wasm: ${d}`),ka(a)&&p(`warning: Loading from a file URI (${a}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`),q(d)}}
async function Oa(a){var b=La;if(!ma&&!ka(b)&&!ca)try{var c=fetch(b,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(c,a)}catch(d){p(`wasm streaming compile failed: ${d}`),p("falling back to ArrayBuffer instantiation")}return Na(b,a)}
var Pa=a=>{for(;0<a.length;)a.shift()(m)},Qa=[],Ra=[],Sa=()=>{var a=m.preRun.shift();Ra.push(a)},ra=a=>{n("number"===typeof a,`ptrToString expects a number, got ${typeof a}`);return"0x"+(a>>>0).toString(16).padStart(8,"0")},Ta=a=>{Ta.R||(Ta.R={});Ta.R[a]||(Ta.R[a]=1,ca&&(a="warning: "+a),p(a))},Ua=new TextDecoder,Va=(a,b,c,d)=>{c=b+c;if(d)return c;for(;a[b]&&!(b>=c);)++b;return b},G=(a,b,c)=>{n("number"==typeof a,`UTF8ToString expects a number (got ${typeof a})`);return a?Ua.decode(B.subarray(a,Va(B,
a,b,c))):""},Wa=[],Xa=0,J=0;class Ya{constructor(a){this.L=a;this.h=a-24}}var ab=a=>{var b=J?.L;if(!b)return Za(0),0;var c=new Ya(b);r[c.h+16>>2]=b;var d=r[c.h+4>>2];if(!d)return Za(0),b;for(var e of a){if(0===e||e===d)break;if($a(e,d,c.h+16))return Za(e),b}Za(d);return b},bb={},cb=a=>{for(;a.length;){var b=a.pop();a.pop()(b)}};function db(a){return this.j(r[a>>2])}
var K={},L={},eb={},fb=class extends Error{constructor(a){super(a);this.name="InternalError"}},N=(a,b,c)=>{function d(h){h=c(h);if(h.length!==a.length)throw new fb("Mismatched type converter count");for(var k=0;k<a.length;++k)M(a[k],h[k])}a.forEach(h=>eb[h]=b);var e=Array(b.length),f=[],g=0;for(let [h,k]of b.entries())L.hasOwnProperty(k)?e[h]=L[k]:(f.push(k),K.hasOwnProperty(k)||(K[k]=[]),K[k].push(()=>{e[h]=L[k];++g;g===f.length&&d(e)}));0===f.length&&d(e)},O=a=>{for(var b="";;){var c=B[a++];if(!c)return b;
b+=String.fromCharCode(c)}},P=class extends Error{constructor(a){super(a);this.name="BindingError"}};function gb(a,b,c={}){var d=b.name;if(!a)throw new P(`type "${d}" must have a positive integer typeid pointer`);if(L.hasOwnProperty(a)){if(c.da)return;throw new P(`Cannot register type '${d}' twice`);}L[a]=b;delete eb[a];K.hasOwnProperty(a)&&(b=K[a],delete K[a],b.forEach(e=>e()))}function M(a,b,c={}){return gb(a,b,c)}
var ib=(a,b,c)=>{switch(b){case 1:return c?d=>A[d]:d=>B[d];case 2:return c?d=>Aa[d>>1]:d=>Ba[d>>1];case 4:return c?d=>E[d>>2]:d=>r[d>>2];case 8:return c?d=>Ea[d>>3]:d=>Fa[d>>3];default:throw new TypeError(`invalid integer width (${b}): ${a}`);}},Q=a=>{if(null===a)return"null";var b=typeof a;return"object"===b||"array"===b||"function"===b?a.toString():""+a},jb=(a,b,c,d)=>{if(b<c||b>d)throw new TypeError(`Passing a number "${Q(b)}" from JS side to C/C++ side to an argument of type "${a}", which is outside the valid range [${c}, ${d}]!`);
},kb=a=>{throw new P(a.g.l.i.name+" instance already deleted");},lb=!1,mb=()=>{},nb=(a,b,c)=>{if(b===c)return a;if(void 0===c.u)return null;a=nb(a,b,c.u);return null===a?null:c.W(a)},ob={},pb={},qb=(a,b)=>{if(void 0===b)throw new P("ptr should not be undefined");for(;a.u;)b=a.J(b),a=a.u;return pb[b]},sb=(a,b)=>{if(!b.l||!b.h)throw new fb("makeClassHandle requires ptr and ptrType");if(!!b.A!==!!b.s)throw new fb("Both smartPtrType and smartPtr must be specified");b.count={value:1};return rb(Object.create(a,
{g:{value:b,writable:!0}}))};function tb(a){function b(){return this.N?sb(this.i.D,{l:this.ga,h:c,A:this,s:a}):sb(this.i.D,{l:this,h:a})}var c=this.Z(a);if(!c)return this.S(a),null;var d=qb(this.i,c);if(void 0!==d){if(0===d.g.count.value)return d.g.h=c,d.g.s=a,d.clone();d=d.clone();this.S(a);return d}d=this.i.Y(c);d=ob[d];if(!d)return b.call(this);d=this.M?d.V:d.pointerType;var e=nb(c,this.i,d.i);return null===e?b.call(this):this.N?sb(d.i.D,{l:d,h:e,A:this,s:a}):sb(d.i.D,{l:d,h:e})}
var rb=a=>{if(!globalThis.FinalizationRegistry)return rb=b=>b,a;lb=new FinalizationRegistry(b=>{console.warn(b.fa);b=b.g;--b.count.value;0===b.count.value&&(b.s?b.A.C(b.s):b.l.i.C(b.h))});rb=b=>{var c=b.g;if(c.s){var d={g:c};c=Error(`Embind found a leaked C++ instance ${c.l.i.name} <${ra(c.h)}>.\n`+"We'll free it automatically in this case, but this functionality is not reliable across various environments.\nMake sure to invoke .delete() manually once you're done with the instance instead.\nOriginally allocated");
"captureStackTrace"in Error&&Error.captureStackTrace(c,tb);d.fa=c.stack.replace(/^Error: /,"");lb.register(b,d,b)}return b};mb=b=>{lb.unregister(b)};return rb(a)},ub=[];function vb(){}
var wb=(a,b)=>Object.defineProperty(b,"name",{value:a}),xb=(a,b,c)=>{if(void 0===a[b].m){var d=a[b];a[b]=function(...e){if(!a[b].m.hasOwnProperty(e.length))throw new P(`Function '${c}' called with an invalid number of arguments (${e.length}) - expects one of (${a[b].m})!`);return a[b].m[e.length].apply(this,e)};a[b].m=[];a[b].m[d.F]=d}},yb=(a,b,c)=>{if(m.hasOwnProperty(a)){if(void 0===c||void 0!==m[a].m&&void 0!==m[a].m[c])throw new P(`Cannot register public name '${a}' twice`);xb(m,a,a);if(m[a].m.hasOwnProperty(c))throw new P(`Cannot register multiple overloads of a function with the same number of arguments (${c})!`);
m[a].m[c]=b}else m[a]=b,m[a].F=c},zb=a=>{n("string"===typeof a);a=a.replace(/[^a-zA-Z0-9_]/g,"$");var b=a.charCodeAt(0);return 48<=b&&57>=b?`_${a}`:a};function Ab(a,b,c,d,e,f,g,h){this.name=a;this.constructor=b;this.D=c;this.C=d;this.u=e;this.Y=f;this.J=g;this.W=h;this.ha=[]}var Bb=(a,b,c)=>{for(;b!==c;){if(!b.J)throw new P(`Expected null or instance of ${c.name}, got an instance of ${b.name}`);a=b.J(a);b=b.u}return a};
function Cb(a,b){if(null===b){if(this.O)throw new P(`null is not a valid ${this.name}`);return 0}if(!b.g)throw new P(`Cannot pass "${Q(b)}" as a ${this.name}`);if(!b.g.h)throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);return Bb(b.g.h,b.g.l.i,this.i)}
function Db(a,b){if(null===b){if(this.O)throw new P(`null is not a valid ${this.name}`);if(this.N){var c=this.P();null!==a&&a.push(this.C,c);return c}return 0}if(!b||!b.g)throw new P(`Cannot pass "${Q(b)}" as a ${this.name}`);if(!b.g.h)throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);if(!this.M&&b.g.l.M)throw new P(`Cannot convert argument of type ${b.g.A?b.g.A.name:b.g.l.name} to parameter type ${this.name}`);c=Bb(b.g.h,b.g.l.i,this.i);if(this.N){if(void 0===b.g.s)throw new P("Passing raw pointer to smart pointer is illegal");
switch(this.ma){case 0:if(b.g.A===this)c=b.g.s;else throw new P(`Cannot convert argument of type ${b.g.A?b.g.A.name:b.g.l.name} to parameter type ${this.name}`);break;case 1:c=b.g.s;break;case 2:if(b.g.A===this)c=b.g.s;else{var d=b.clone();c=this.ia(c,Eb(()=>d["delete"]()));null!==a&&a.push(this.C,c)}break;default:throw new P("Unsupporting sharing policy");}}return c}
function Fb(a,b){if(null===b){if(this.O)throw new P(`null is not a valid ${this.name}`);return 0}if(!b.g)throw new P(`Cannot pass "${Q(b)}" as a ${this.name}`);if(!b.g.h)throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);if(b.g.l.M)throw new P(`Cannot convert argument of type ${b.g.l.name} to parameter type ${this.name}`);return Bb(b.g.h,b.g.l.i,this.i)}
function Gb(a,b,c,d,e,f,g,h,k,l,t){this.name=a;this.i=b;this.O=c;this.M=d;this.N=e;this.ga=f;this.ma=g;this.U=h;this.P=k;this.ia=l;this.C=t;e||void 0!==b.u?this.o=Db:(this.o=d?Cb:Fb,this.v=null)}
var Hb=(a,b,c)=>{if(!m.hasOwnProperty(a))throw new fb("Replacing nonexistent public symbol");void 0!==m[a].m&&void 0!==c?m[a].m[c]=b:(m[a]=b,m[a].F=c)},S=(a,b,c=!1)=>{n(!c,"Async bindings are only supported with JSPI.");a=O(a);c=R.get(b);if("function"!=typeof c)throw new P(`unknown function pointer with signature ${a}: ${b}`);return c};class Ib extends Error{}
var Kb=a=>{a=Jb(a);var b=O(a);U(a);return b},V=(a,b)=>{function c(f){e[f]||L[f]||(eb[f]?eb[f].forEach(c):(d.push(f),e[f]=!0))}var d=[],e={};b.forEach(c);throw new Ib(`${a}: `+d.map(Kb).join([", "]));};function Lb(a){for(var b=1;b<a.length;++b)if(null!==a[b]&&void 0===a[b].v)return!0;return!1}function Mb(a){for(var b=a.length-2,c=a.length-1;2<=c&&a[c].optional;--c)b--;return b}
function Nb(a,b,c,d,e,f){var g=b.length;if(2>g)throw new P("argTypes array size mismatch! Must at least get return value and 'this' types!");n(!f,"Async bindings are only supported with JSPI.");var h=null!==b[1]&&null!==c,k=Lb(b),l=!b[0].ea,t=g-2,v=Mb(b),x=Array(t),y=[],z=[];return wb(a,function(...D){var C=D.length;if(C<v||C>t)throw new P(`function ${a} called with ${C} arguments, expected ${v==t?v:`${v} to ${t}`}`);z.length=0;y.length=h?2:1;y[0]=e;if(h){var H=b[1].o(z,this);y[1]=H}for(C=0;C<t;++C)x[C]=
b[C+2].o(z,D[C]),y.push(x[C]);D=d(...y);if(k)cb(z);else for(C=h?1:2;C<b.length;C++){var I=1===C?H:x[C-2];null!==b[C].v&&b[C].v(I)}H=l?b[0].j(D):void 0;return H})}
var Ob=(a,b)=>{for(var c=[],d=0;d<a;d++)c.push(r[b+4*d>>2]);return c},Pb=a=>{a=a.trim();const b=a.indexOf("(");if(-1===b)return a;n(a.endsWith(")"),"Parentheses for argument names should match.");return a.slice(0,b)},Qb=(a,b,c)=>{if(!(a instanceof Object))throw new P(`${c} with invalid "this": ${a}`);if(!(a instanceof b.i.constructor))throw new P(`${c} incompatible with "this" of type ${a.constructor.name}`);if(!a.g.h)throw new P(`cannot call emscripten binding method ${c} on deleted object`);return Bb(a.g.h,
a.g.l.i,b.i)},Sb=[],W=[0,1,,1,null,1,!0,1,!1,1],Tb=a=>{9<a&&0===--W[a+1]&&(n(void 0!==W[a],"Decref for unallocated handle."),W[a]=void 0,Sb.push(a))},Ub=a=>{if(!a)throw new P(`Cannot use deleted val. handle = ${a}`);n(2===a||void 0!==W[a]&&0===a%2,`invalid handle: ${a}`);return W[a]},Eb=a=>{switch(a){case void 0:return 2;case null:return 4;case !0:return 6;case !1:return 8;default:const b=Sb.pop()||W.length;W[b]=a;W[b+1]=1;return b}},Vb={name:"emscripten::val",j:a=>{var b=Ub(a);Tb(a);return b},o:(a,
b)=>Eb(b),B:db,v:null},Wb=(a,b,c)=>{switch(b){case 1:return c?function(d){return this.j(A[d])}:function(d){return this.j(B[d])};case 2:return c?function(d){return this.j(Aa[d>>1])}:function(d){return this.j(Ba[d>>1])};case 4:return c?function(d){return this.j(E[d>>2])}:function(d){return this.j(r[d>>2])};default:throw new TypeError(`invalid integer width (${b}): ${a}`);}},Xb=(a,b)=>{var c=L[a];if(void 0===c)throw a=`${b} has unknown type ${Kb(a)}`,new P(a);return c},Yb=(a,b)=>{switch(b){case 4:return function(c){return this.j(Ca[c>>
2])};case 8:return function(c){return this.j(Da[c>>3])};default:throw new TypeError(`invalid float width (${b}): ${a}`);}},Zb=(a,b,c)=>{n("number"==typeof c,"stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");var d=B;n("string"===typeof a,`stringToUTF8Array expects a string (got ${typeof a})`);if(0<c){var e=b;c=b+c-1;for(var f=0;f<a.length;++f){var g=a.codePointAt(f);if(127>=g){if(b>=c)break;d[b++]=g}else if(2047>=g){if(b+1>=
c)break;d[b++]=192|g>>6;d[b++]=128|g&63}else if(65535>=g){if(b+2>=c)break;d[b++]=224|g>>12;d[b++]=128|g>>6&63;d[b++]=128|g&63}else{if(b+3>=c)break;1114111<g&&Ta("Invalid Unicode code point "+ra(g)+" encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).");d[b++]=240|g>>18;d[b++]=128|g>>12&63;d[b++]=128|g>>6&63;d[b++]=128|g&63;f++}}d[b]=0;a=b-e}else a=0;return a},$b=a=>{for(var b=0,c=0;c<a.length;++c){var d=a.charCodeAt(c);
127>=d?b++:2047>=d?b+=2:55296<=d&&57343>=d?(b+=4,++c):b+=3}return b},ac=new TextDecoder("utf-16le"),bc=(a,b,c)=>{n(0==a%2,"Pointer passed to UTF16ToString must be aligned to two bytes!");a>>=1;return ac.decode(Ba.subarray(a,Va(Ba,a,b/2,c)))},cc=(a,b,c)=>{n(0==b%2,"Pointer passed to stringToUTF16 must be aligned to two bytes!");n("number"==typeof c,"stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");c??=2147483647;if(2>c)return 0;
c-=2;var d=b;c=c<2*a.length?c/2:a.length;for(var e=0;e<c;++e)Aa[b>>1]=a.charCodeAt(e),b+=2;Aa[b>>1]=0;return b-d},dc=a=>2*a.length,ec=(a,b,c)=>{n(0==a%4,"Pointer passed to UTF32ToString must be aligned to four bytes!");var d="";a>>=2;for(var e=0;!(e>=b/4);e++){var f=r[a+e];if(!f&&!c)break;d+=String.fromCodePoint(f)}return d},fc=(a,b,c)=>{n(0==b%4,"Pointer passed to stringToUTF32 must be aligned to four bytes!");n("number"==typeof c,"stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");
c??=2147483647;if(4>c)return 0;var d=b;c=d+c-4;for(var e=0;e<a.length;++e){var f=a.codePointAt(e);65535<f&&e++;E[b>>2]=f;b+=4;if(b+4>c)break}E[b>>2]=0;return b-d},gc=a=>{for(var b=0,c=0;c<a.length;++c)65535<a.codePointAt(c)&&c++,b+=4;return b},hc=[],ic=a=>{var b=hc.length;hc.push(a);return b},jc=(a,b)=>{for(var c=Array(a),d=0;d<a;++d)c[d]=Xb(r[b+4*d>>2],`parameter ${d}`);return c},kc={},lc={},nc=()=>{if(!mc){var a={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:(globalThis.navigator?.language??
"C").replace("-","_")+".UTF-8",_:ea||"./this.program"},b;for(b in lc)void 0===lc[b]?delete a[b]:a[b]=lc[b];var c=[];for(b in a)c.push(`${b}=${a[b]}`);mc=c}return mc},mc,oc=[null,[],[]],ta=a=>{var b=X(),c=pc(4),d=pc(4);qc(a,c,d);a=r[c>>2];d=r[d>>2];c=G(a);U(a);if(d){var e=G(d);U(d)}Y(b);return[c,e]};
(()=>{let a=vb.prototype;Object.assign(a,{isAliasOf:function(c){if(!(this instanceof vb&&c instanceof vb))return!1;var d=this.g.l.i,e=this.g.h;c.g=c.g;var f=c.g.l.i;for(c=c.g.h;d.u;)e=d.J(e),d=d.u;for(;f.u;)c=f.J(c),f=f.u;return d===f&&e===c},clone:function(){this.g.h||kb(this);if(this.g.I)return this.g.count.value+=1,this;var c=rb,d=Object,e=d.create,f=Object.getPrototypeOf(this),g=this.g;c=c(e.call(d,f,{g:{value:{count:g.count,H:g.H,I:g.I,h:g.h,l:g.l,s:g.s,A:g.A}}}));c.g.count.value+=1;c.g.H=!1;
return c},["delete"](){this.g.h||kb(this);if(this.g.H&&!this.g.I)throw new P("Object already scheduled for deletion");mb(this);var c=this.g;--c.count.value;0===c.count.value&&(c.s?c.A.C(c.s):c.l.i.C(c.h));this.g.I||(this.g.s=void 0,this.g.h=void 0)},isDeleted:function(){return!this.g.h},deleteLater:function(){this.g.h||kb(this);if(this.g.H&&!this.g.I)throw new P("Object already scheduled for deletion");ub.push(this);this.g.H=!0;return this}});const b=Symbol.dispose;b&&(a[b]=a["delete"])})();
Object.assign(Gb.prototype,{Z(a){this.U&&(a=this.U(a));return a},S(a){this.C?.(a)},B:db,j:tb});n(10===W.length);m.print&&(la=m.print);m.printErr&&(p=m.printErr);m.wasmBinary&&(ma=m.wasmBinary);m.FS_createDataFile=function(){Ja()};m.FS_createPreloadedFile=function(){Ja()};Object.getOwnPropertyDescriptor(m,"fetchSettings")&&q("`Module.fetchSettings` was supplied but `fetchSettings` not included in INCOMING_MODULE_JS_API");m.thisProgram&&(ea=m.thisProgram);
n("undefined"==typeof m.memoryInitializerPrefixURL,"Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead");n("undefined"==typeof m.pthreadMainPrefixURL,"Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead");n("undefined"==typeof m.cdInitializerPrefixURL,"Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead");n("undefined"==typeof m.filePackagePrefixURL,"Module.filePackagePrefixURL option was removed, use Module.locateFile instead");
n("undefined"==typeof m.read,"Module.read option was removed");n("undefined"==typeof m.readAsync,"Module.readAsync option was removed (modify readAsync in JS)");n("undefined"==typeof m.readBinary,"Module.readBinary option was removed (modify readBinary in JS)");n("undefined"==typeof m.setWindowTitle,"Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)");n("undefined"==typeof m.TOTAL_MEMORY,"Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY");
n("undefined"==typeof m.ENVIRONMENT,"Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)");n("undefined"==typeof m.STACK_SIZE,"STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time");n("undefined"==typeof m.wasmMemory,"Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally");n("undefined"==typeof m.INITIAL_MEMORY,"Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically");
if(m.preInit)for("function"==typeof m.preInit&&(m.preInit=[m.preInit]);0<m.preInit.length;)m.preInit.shift()();wa("preInit");"writeI53ToI64 writeI53ToI64Clamped writeI53ToI64Signaling writeI53ToU64Clamped writeI53ToU64Signaling readI53FromI64 readI53FromU64 convertI32PairToI53 convertI32PairToI53Checked convertU32PairToI53 getTempRet0 zeroMemory exitJS withStackSave strError inetPton4 inetNtop4 inetPton6 inetNtop6 readSockaddr writeSockaddr readEmAsmArgs jstoi_q autoResumeAudioContext getDynCaller dynCall setWasmTableEntry handleException keepRuntimeAlive runtimeKeepalivePush runtimeKeepalivePop callUserCallback maybeExit asyncLoad asmjsMangle mmapAlloc HandleAllocator getUniqueRunDependency addRunDependency removeRunDependency addOnInit addOnPostCtor addOnPreMain addOnExit STACK_SIZE STACK_ALIGN POINTER_SIZE ASSERTIONS ccall cwrap convertJsFunctionToWasm getEmptyTableSlot updateTableMap getFunctionAddress addFunction removeFunction intArrayFromString intArrayToString stringToAscii stringToNewUTF8 stringToUTF8OnStack writeArrayToMemory registerKeyEventCallback maybeCStringToJsString findEventTarget getBoundingClientRect fillMouseEventData registerMouseEventCallback registerWheelEventCallback registerUiEventCallback registerFocusEventCallback fillDeviceOrientationEventData registerDeviceOrientationEventCallback fillDeviceMotionEventData registerDeviceMotionEventCallback screenOrientation fillOrientationChangeEventData registerOrientationChangeEventCallback fillFullscreenChangeEventData registerFullscreenChangeEventCallback JSEvents_requestFullscreen JSEvents_resizeCanvasForFullscreen registerRestoreOldStyle hideEverythingExceptGivenElement restoreHiddenElements setLetterbox softFullscreenResizeWebGLRenderTarget doRequestFullscreen fillPointerlockChangeEventData registerPointerlockChangeEventCallback registerPointerlockErrorEventCallback requestPointerLock fillVisibilityChangeEventData registerVisibilityChangeEventCallback registerTouchEventCallback fillGamepadEventData registerGamepadEventCallback registerBeforeUnloadEventCallback fillBatteryEventData registerBatteryEventCallback setCanvasElementSize getCanvasElementSize jsStackTrace getCallstack convertPCtoSourceLocation wasiRightsToMuslOFlags wasiOFlagsToMuslOFlags initRandomFill randomFill safeSetTimeout setImmediateWrapped safeRequestAnimationFrame clearImmediateWrapped registerPostMainLoop registerPreMainLoop getPromise makePromise idsToPromises makePromiseCallback Browser_asyncPrepareDataCounter isLeapYear ydayFromDate arraySum addDays getSocketFromFD getSocketAddress heapObjectForWebGLType toTypedArrayIndex webgl_enable_ANGLE_instanced_arrays webgl_enable_OES_vertex_array_object webgl_enable_WEBGL_draw_buffers webgl_enable_WEBGL_multi_draw webgl_enable_EXT_polygon_offset_clamp webgl_enable_EXT_clip_control webgl_enable_WEBGL_polygon_mode emscriptenWebGLGet computeUnpackAlignedImageSize colorChannelsInGlTextureFormat emscriptenWebGLGetTexPixelData emscriptenWebGLGetUniform webglGetUniformLocation webglPrepareUniformLocationsBeforeFirstUse webglGetLeftBracePos emscriptenWebGLGetVertexAttrib __glGetActiveAttribOrUniform writeGLArray registerWebGlEventCallback runAndAbortIfError ALLOC_NORMAL ALLOC_STACK allocate writeStringToMemory writeAsciiToMemory allocateUTF8 allocateUTF8OnStack demangle stackTrace getNativeTypeSize getFunctionArgsName createJsInvokerSignature createJsInvoker PureVirtualError registerInheritedInstance unregisterInheritedInstance getInheritedInstanceCount getLiveInheritedInstances setDelayFunction count_emval_handles".split(" ").forEach(function(a){xa(a)});
"run out err callMain abort wasmExports HEAPF32 HEAPF64 HEAP8 HEAPU8 HEAP16 HEAPU16 HEAP32 HEAPU32 HEAP64 HEAPU64 writeStackCookie checkStackCookie INT53_MAX INT53_MIN bigintToI53Checked stackSave stackRestore stackAlloc setTempRet0 createNamedFunction ptrToString getHeapMax growMemory ENV ERRNO_CODES DNS Protocols Sockets timers warnOnce readEmAsmArgsArray getExecutableName getWasmTableEntry alignMemory wasmTable wasmMemory noExitRuntime addOnPreRun addOnPostRun freeTableIndexes functionsInTableMap setValue getValue PATH PATH_FS UTF8Decoder UTF8ArrayToString UTF8ToString stringToUTF8Array stringToUTF8 lengthBytesUTF8 AsciiToString UTF16Decoder UTF16ToString stringToUTF16 lengthBytesUTF16 UTF32ToString stringToUTF32 lengthBytesUTF32 JSEvents specialHTMLTargets findCanvasEventTarget currentFullscreenStrategy restoreOldWindowedStyle UNWIND_CACHE ExitStatus getEnvStrings checkWasiClock flush_NO_FILESYSTEM emSetImmediate emClearImmediate_deps emClearImmediate promiseMap uncaughtExceptionCount exceptionLast exceptionCaught ExceptionInfo findMatchingCatch getExceptionMessageCommon Browser requestFullscreen requestFullScreen setCanvasSize getUserMedia createContext getPreloadedImageData__data wget MONTH_DAYS_REGULAR MONTH_DAYS_LEAP MONTH_DAYS_REGULAR_CUMULATIVE MONTH_DAYS_LEAP_CUMULATIVE SYSCALLS tempFixedLengthArray miniTempWebGLFloatBuffers miniTempWebGLIntBuffers GL AL GLUT EGL GLEW IDBStore SDL SDL_gfx print printErr jstoi_s InternalError BindingError throwInternalError throwBindingError registeredTypes awaitingDependencies typeDependencies tupleRegistrations structRegistrations sharedRegisterType whenDependentTypesAreResolved getTypeName getFunctionName heap32VectorToArray requireRegisteredType usesDestructorStack checkArgCount getRequiredArgCount UnboundTypeError EmValType EmValOptionalType throwUnboundTypeError ensureOverloadTable exposePublicSymbol replacePublicSymbol embindRepr registeredInstances getBasestPointer getInheritedInstance registeredPointers registerType integerReadValueFromPointer enumReadValueFromPointer floatReadValueFromPointer assertIntegerRange readPointer runDestructors craftInvokerFunction embind__requireFunction genericPointerToWireType constNoSmartPtrRawPointerToWireType nonConstNoSmartPtrRawPointerToWireType init_RegisteredPointer RegisteredPointer RegisteredPointer_fromWireType runDestructor releaseClassHandle finalizationRegistry detachFinalizer_deps detachFinalizer attachFinalizer makeClassHandle init_ClassHandle ClassHandle throwInstanceAlreadyDeleted deletionQueue flushPendingDeletes delayFunction RegisteredClass shallowCopyInternalPointer downcastPointer upcastPointer validateThis char_0 char_9 makeLegalFunctionName emval_freelist emval_handles emval_symbols getStringOrSymbol Emval emval_returnValue emval_lookupTypes emval_methodCallers emval_addMethodCaller".split(" ").forEach(xa);
m.incrementExceptionRefcount=a=>rc(a);m.decrementExceptionRefcount=a=>sc(a);m.getExceptionMessage=a=>ta(a);
var Jb=w("___getTypeName"),U=w("_free"),tc=w("_malloc"),uc=w("___cxa_get_exception_ptr"),pa=w("_emscripten_stack_get_end"),Z=w("_setThrew"),Za=w("__emscripten_tempret_set"),vc=w("_emscripten_stack_init"),Y=w("__emscripten_stack_restore"),pc=w("__emscripten_stack_alloc"),X=w("_emscripten_stack_get_current"),sc=w("___cxa_decrement_exception_refcount"),rc=w("___cxa_increment_exception_refcount"),qc=w("___get_exception_message"),$a=w("___cxa_can_catch"),Ia=w("wasmMemory"),R=w("wasmTable"),Le={__assert_fail:(a,
b,c,d)=>q(`Assertion failed: ${G(a)}, at: `+[b?G(b):"unknown filename",c,d?G(d):"unknown function"]),__cxa_begin_catch:a=>{var b=new Ya(a);0==A[b.h+12]&&(A[b.h+12]=1,Xa--);A[b.h+13]=0;Wa.push(b);rc(a);return uc(a)},__cxa_end_catch:()=>{Z(0,0);n(0<Wa.length);var a=Wa.pop();sc(a.L);J=0},__cxa_find_matching_catch_2:()=>ab([]),__cxa_find_matching_catch_3:a=>ab([a]),__cxa_find_matching_catch_4:(a,b)=>ab([a,b]),__cxa_find_matching_catch_5:(a,b,c)=>ab([a,b,c]),__cxa_find_matching_catch_6:(a,b,c,d)=>ab([a,
b,c,d]),__cxa_rethrow:()=>{var a=Wa.pop();a||q("no exception to throw");var b=a.L;0==A[a.h+13]&&(Wa.push(a),A[a.h+13]=1,A[a.h+12]=0,Xa++);J=new sa(b);throw J;},__cxa_throw:(a,b,c)=>{var d=new Ya(a);r[d.h+16>>2]=0;r[d.h+4>>2]=b;r[d.h+8>>2]=c;J=new sa(a);Xa++;throw J;},__cxa_uncaught_exceptions:()=>Xa,__resumeException:a=>{J||=new sa(a);throw J;},__syscall_fcntl64:function(){return 0},__syscall_fstat64:()=>{q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},__syscall_getdents64:()=>
{q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},__syscall_ioctl:function(){return 0},__syscall_lstat64:()=>{q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},__syscall_mkdirat:()=>{q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},__syscall_newfstatat:()=>{q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},__syscall_openat:function(){q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},
__syscall_stat64:()=>{q("it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM")},_abort_js:()=>q("native code called abort()"),_embind_finalize_value_object:a=>{var b=bb[a];delete bb[a];var c=b.P,d=b.C,e=b.T,f=e.map(g=>g.ba).concat(e.map(g=>g.ka));N([a],f,g=>{var h={},k,l;for([k,l]of e.entries()){const t=g[k],v=l.$,x=l.aa,y=g[k+e.length],z=l.ja,D=l.la;h[l.X]={read:C=>t.j(v(x,C)),write:(C,H)=>{var I=[];z(D,C,y.o(I,H));cb(I)},optional:t.optional}}return[{name:b.name,j:t=>
{var v={},x;for(x in h)v[x]=h[x].read(t);d(t);return v},o:(t,v)=>{for(var x in h)if(!(x in v||h[x].optional))throw new TypeError(`Missing field: "${x}"`);var y=c();for(x in h)h[x].write(y,v[x]);null!==t&&t.push(d,y);return y},B:db,v:d}]})},_embind_register_bigint:(a,b,c,d,e)=>{b=O(b);const f=0n===d;let g=h=>h;if(f){const h=8*c;g=k=>BigInt.asUintN(h,k);e=g(e)}M(a,{name:b,j:g,o:(h,k)=>{if("number"==typeof k)k=BigInt(k);else if("bigint"!=typeof k)throw new TypeError(`Cannot convert "${Q(k)}" to ${this.name}`);
jb(b,k,d,e);return k},B:ib(b,c,!f),v:null})},_embind_register_bool:(a,b,c,d)=>{b=O(b);M(a,{name:b,j:function(e){return!!e},o:function(e,f){return f?c:d},B:function(e){return this.j(B[e])},v:null})},_embind_register_class:(a,b,c,d,e,f,g,h,k,l,t,v,x)=>{t=O(t);f=S(e,f);h&&=S(g,h);l&&=S(k,l);x=S(v,x);var y=zb(t);yb(y,function(){V(`Cannot construct ${t} due to unbound types`,[d])});N([a,b,c],d?[d]:[],z=>{z=z[0];if(d){var D=z.i;var C=D.D}else C=vb.prototype;z=wb(t,function(...hb){if(Object.getPrototypeOf(this)!==
H)throw new P(`Use 'new' to construct ${t}`);if(void 0===I.G)throw new P(`${t} has no accessible constructor`);var Rb=I.G[hb.length];if(void 0===Rb)throw new P(`Tried to invoke ctor of ${t} with invalid number of parameters (${hb.length}) - expected (${Object.keys(I.G).toString()}) parameters instead!`);return Rb.apply(this,hb)});var H=Object.create(C,{constructor:{value:z}});z.prototype=H;var I=new Ab(t,z,H,x,D,f,h,l);if(I.u){var T;(T=I.u).K??(T.K=[]);I.u.K.push(I)}D=new Gb(t,I,!0,!1,!1);T=new Gb(t+
"*",I,!1,!1,!1);C=new Gb(t+" const*",I,!1,!0,!1);ob[a]={pointerType:T,V:C};Hb(y,z);return[D,T,C]})},_embind_register_class_class_function:(a,b,c,d,e,f,g,h)=>{var k=Ob(c,d);b=O(b);b=Pb(b);f=S(e,f,h);N([],[a],l=>{function t(){V(`Cannot call ${v} due to unbound types`,k)}l=l[0];var v=`${l.name}.${b}`;b.startsWith("@@")&&(b=Symbol[b.substring(2)]);var x=l.i.constructor;void 0===x[b]?(t.F=c-1,x[b]=t):(xb(x,b,v),x[b].m[c-1]=t);N([],k,y=>{y=[y[0],null].concat(y.slice(1));y=Nb(v,y,null,f,g,h);void 0===x[b].m?
(y.F=c-1,x[b]=y):x[b].m[c-1]=y;if(l.i.K)for(const z of l.i.K)z.constructor.hasOwnProperty(b)||(z.constructor[b]=y);return[]});return[]})},_embind_register_class_constructor:(a,b,c,d,e,f)=>{n(0<b);var g=Ob(b,c);e=S(d,e);N([],[a],h=>{h=h[0];var k=`constructor ${h.name}`;void 0===h.i.G&&(h.i.G=[]);if(void 0!==h.i.G[b-1])throw new P(`Cannot register multiple constructors with identical number of parameters (${b-1}) for class '${h.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
h.i.G[b-1]=()=>{V(`Cannot construct ${h.name} due to unbound types`,g)};N([],g,l=>{l.splice(1,0,null);h.i.G[b-1]=Nb(k,l,null,e,f);return[]});return[]})},_embind_register_class_function:(a,b,c,d,e,f,g,h,k)=>{var l=Ob(c,d);b=O(b);b=Pb(b);f=S(e,f,k);N([],[a],t=>{function v(){V(`Cannot call ${x} due to unbound types`,l)}t=t[0];var x=`${t.name}.${b}`;b.startsWith("@@")&&(b=Symbol[b.substring(2)]);h&&t.i.ha.push(b);var y=t.i.D,z=y[b];void 0===z||void 0===z.m&&z.className!==t.name&&z.F===c-2?(v.F=c-2,v.className=
t.name,y[b]=v):(xb(y,b,x),y[b].m[c-2]=v);N([],l,D=>{D=Nb(x,D,t,f,g,k);void 0===y[b].m?(D.F=c-2,y[b]=D):y[b].m[c-2]=D;return[]});return[]})},_embind_register_class_property:(a,b,c,d,e,f,g,h,k,l)=>{b=O(b);e=S(d,e);N([],[a],t=>{t=t[0];var v=`${t.name}.${b}`,x={get(){V(`Cannot access ${v} due to unbound types`,[c,g])},enumerable:!0,configurable:!0};x.set=k?()=>V(`Cannot access ${v} due to unbound types`,[c,g]):()=>{throw new P(v+" is a read-only property");};Object.defineProperty(t.i.D,b,x);N([],k?[c,
g]:[c],y=>{var z=y[0],D={get(){var H=Qb(this,t,v+" getter");return z.j(e(f,H))},enumerable:!0};if(k){k=S(h,k);var C=y[1];D.set=function(H){var I=Qb(this,t,v+" setter"),T=[];k(l,I,C.o(T,H));cb(T)}}Object.defineProperty(t.i.D,b,D);return[]});return[]})},_embind_register_emval:a=>M(a,Vb),_embind_register_enum:(a,b,c,d)=>{function e(){}b=O(b);e.values={};M(a,{name:b,constructor:e,j:function(f){return this.constructor.values[f]},o:(f,g)=>g.value,B:Wb(b,c,d),v:null});yb(b,e)},_embind_register_enum_value:(a,
b,c)=>{var d=Xb(a,"enum");b=O(b);a=d.constructor;d=Object.create(d.constructor.prototype,{value:{value:c},constructor:{value:wb(`${d.name}_${b}`,function(){})}});a.values[c]=d;a[b]=d},_embind_register_float:(a,b,c)=>{b=O(b);M(a,{name:b,j:d=>d,o:(d,e)=>{if("number"!=typeof e&&"boolean"!=typeof e)throw new TypeError(`Cannot convert ${Q(e)} to ${this.name}`);return e},B:Yb(b,c),v:null})},_embind_register_function:(a,b,c,d,e,f,g)=>{var h=Ob(b,c);a=O(a);a=Pb(a);e=S(d,e,g);yb(a,function(){V(`Cannot call ${a} due to unbound types`,
h)},b-1);N([],h,k=>{k=[k[0],null].concat(k.slice(1));Hb(a,Nb(a,k,null,e,f,g),b-1);return[]})},_embind_register_integer:(a,b,c,d,e)=>{b=O(b);let f=h=>h;if(0===d){var g=32-8*c;f=h=>h<<g>>>g;e=f(e)}M(a,{name:b,j:f,o:(h,k)=>{if("number"!=typeof k&&"boolean"!=typeof k)throw new TypeError(`Cannot convert "${Q(k)}" to ${b}`);jb(b,k,d,e);return k},B:ib(b,c,0!==d),v:null})},_embind_register_memory_view:(a,b,c)=>{function d(f){return new e(A.buffer,r[f+4>>2],r[f>>2])}var e=[Int8Array,Uint8Array,Int16Array,
Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array][b];c=O(c);M(a,{name:c,j:d,B:d},{da:!0})},_embind_register_std_string:(a,b)=>{b=O(b);M(a,{name:b,j(c){var d=G(c+4,r[c>>2],!0);U(c);return d},o(c,d){d instanceof ArrayBuffer&&(d=new Uint8Array(d));var e="string"==typeof d;if(!(e||ArrayBuffer.isView(d)&&1==d.BYTES_PER_ELEMENT))throw new P("Cannot pass non-string to std::string");var f=e?$b(d):d.length;var g=tc(4+f+1),h=g+4;r[g>>2]=f;e?Zb(d,h,f+1):B.set(d,h);null!==
c&&c.push(U,g);return g},B:db,v(c){U(c)}})},_embind_register_std_wstring:(a,b,c)=>{c=O(c);if(2===b){var d=bc;var e=cc;var f=dc}else n(4===b,"only 2-byte and 4-byte strings are currently supported"),d=ec,e=fc,f=gc;M(a,{name:c,j:g=>{var h=d(g+4,r[g>>2]*b,!0);U(g);return h},o:(g,h)=>{if("string"!=typeof h)throw new P(`Cannot pass non-string to C++ string type ${c}`);var k=f(h),l=tc(4+k+b);r[l>>2]=k/b;e(h,l+4,k+b);null!==g&&g.push(U,l);return l},B:db,v(g){U(g)}})},_embind_register_value_object:(a,b,c,
d,e,f)=>{bb[a]={name:O(b),P:S(c,d),C:S(e,f),T:[]}},_embind_register_value_object_field:(a,b,c,d,e,f,g,h,k,l)=>{bb[a].T.push({X:O(b),ba:c,$:S(d,e),aa:f,ka:g,ja:S(h,k),la:l})},_embind_register_void:(a,b)=>{b=O(b);M(a,{ea:!0,name:b,j:()=>{},o:()=>{}})},_emval_create_invoker:(a,b,c)=>{var [d,...e]=jc(a,b),f=d.o.bind(d),g=e.map(k=>k.B.bind(k));a--;var h=Array(a);b=`methodCaller<(${e.map(k=>k.name)}) => ${d.name}>`;return ic(wb(b,(k,l,t,v)=>{for(var x=0,y=0;y<a;++y)h[y]=g[y](v+x),x+=8;switch(c){case 0:var z=
Ub(k).apply(null,h);break;case 2:z=Reflect.construct(Ub(k),h);break;case 3:z=h[0];break;case 1:z=D;v=kc[l];l=z[void 0===v?O(l):v];var D;Ub(k);z=l.call(z,...h)}k=[];l=f(k,z);k.length&&(r[t>>2]=Eb(k));return l}))},_emval_decref:Tb,_emval_invoke:(a,b,c,d,e)=>hc[a](b,c,d,e),_emval_run_destructors:a=>{var b=Ub(a);cb(b);Tb(a)},_tzset_js:(a,b,c,d)=>{var e=(new Date).getFullYear(),f=(new Date(e,0,1)).getTimezoneOffset();e=(new Date(e,6,1)).getTimezoneOffset();r[a>>2]=60*Math.max(f,e);E[b>>2]=Number(f!=e);
b=g=>{var h=Math.abs(g);return`UTC${0<=g?"-":"+"}${String(Math.floor(h/60)).padStart(2,"0")}${String(h%60).padStart(2,"0")}`};a=b(f);b=b(e);n(a);n(b);n(16>=$b(a),`timezone name truncated to fit in TZNAME_MAX (${a})`);n(16>=$b(b),`timezone name truncated to fit in TZNAME_MAX (${b})`);e<f?(Zb(a,c,17),Zb(b,d,17)):(Zb(a,d,17),Zb(b,c,17))},clock_time_get:function(a,b,c){if(!(0<=a&&3>=a))return 28;Ea[c>>3]=BigInt(Math.round(1E6*(0===a?Date.now():performance.now())));return 0},emscripten_resize_heap:a=>
{var b=B.length;a>>>=0;n(a>b);if(2147483648<a)return p(`Cannot enlarge memory, requested ${a} bytes, but the limit is ${2147483648} bytes!`),!1;for(var c=1;4>=c;c*=2){var d=b*(1+.2/c);d=Math.min(d,a+100663296);var e=Math,f=e.min;d=Math.max(a,d);n(65536,"alignment argument is required");e=f.call(e,2147483648,65536*Math.ceil(d/65536));a:{f=e;d=Ia.buffer.byteLength;try{Ia.grow((f-d+65535)/65536|0);Ha();var g=1;break a}catch(h){p(`growMemory: Attempted to grow heap from ${d} bytes to ${f} bytes, but got error: ${h}`)}g=
void 0}if(g)return!0}p(`Failed to grow the heap from ${b} bytes to ${e} bytes, not enough memory!`);return!1},environ_get:(a,b)=>{var c=0,d=0,e;for(e of nc()){var f=b+c;r[a+d>>2]=f;c+=Zb(e,f,Infinity)+1;d+=4}return 0},environ_sizes_get:(a,b)=>{var c=nc();r[a>>2]=c.length;a=0;for(var d of c)a+=$b(d)+1;r[b>>2]=a;return 0},fd_close:()=>{q("fd_close called without SYSCALLS_REQUIRE_FILESYSTEM")},fd_read:()=>{q("fd_read called without SYSCALLS_REQUIRE_FILESYSTEM")},fd_seek:function(){return 70},fd_write:(a,
b,c,d)=>{for(var e=0,f=0;f<c;f++){var g=r[b>>2],h=r[b+4>>2];b+=8;for(var k=0;k<h;k++){var l=a,t=B[g+k],v=oc[l];n(v);0===t||10===t?(l=1===l?la:p,t=Va(v,0),t=Ua.decode(v.buffer?v.subarray(0,t):new Uint8Array(v.slice(0,t))),l(t),v.length=0):v.push(t)}e+=h}r[d>>2]=e;return 0},invoke_dd:wc,invoke_dddd:xc,invoke_ddddd:yc,invoke_dddid:zc,invoke_ddi:Ac,invoke_di:Bc,invoke_did:Cc,invoke_didd:Dc,invoke_diddd:Ec,invoke_didddd:Fc,invoke_didddddi:Gc,invoke_diddddi:Hc,invoke_didddi:Ic,invoke_diddi:Jc,invoke_diddid:Kc,
invoke_diddiid:Lc,invoke_diddiii:Mc,invoke_didi:Nc,invoke_didii:Oc,invoke_dii:Pc,invoke_diidd:Qc,invoke_diididi:Rc,invoke_diididid:Sc,invoke_diii:Tc,invoke_diiid:Uc,invoke_diiidi:Vc,invoke_diiii:Wc,invoke_diiiid:Xc,invoke_diiiii:Yc,invoke_diiiiid:Zc,invoke_diiiiii:$c,invoke_diiiiiid:ad,invoke_diiiiiii:bd,invoke_diiiiiiii:cd,invoke_fiii:dd,invoke_i:ed,invoke_idiiii:fd,invoke_ii:gd,invoke_iid:hd,invoke_iidddd:jd,invoke_iiddddd:kd,invoke_iii:ld,invoke_iiid:md,invoke_iiiddidd:nd,invoke_iiidi:od,invoke_iiii:pd,
invoke_iiiid:qd,invoke_iiiidd:rd,invoke_iiiii:sd,invoke_iiiiid:td,invoke_iiiiidddiii:ud,invoke_iiiiidi:vd,invoke_iiiiidiii:wd,invoke_iiiiii:xd,invoke_iiiiiidi:yd,invoke_iiiiiii:zd,invoke_iiiiiiii:Ad,invoke_iiiiiiiii:Bd,invoke_iiiiiiiiii:Cd,invoke_iiiiiiiiiii:Dd,invoke_iiiiiiiiiiii:Ed,invoke_iiiiiiiiiiiii:Fd,invoke_iij:Gd,invoke_iiji:Hd,invoke_iijiii:Id,invoke_iijji:Jd,invoke_iijjiii:Kd,invoke_ijjiiii:Ld,invoke_ji:Md,invoke_jiiii:Nd,invoke_v:Od,invoke_vdd:Pd,invoke_vddddiiii:Qd,invoke_vdii:Rd,invoke_vdiiii:Sd,
invoke_vi:Td,invoke_vid:Ud,invoke_vidd:Vd,invoke_viddd:Wd,invoke_vidddddddd:Xd,invoke_viddddddddii:Yd,invoke_viddddddddiii:Zd,invoke_vidddiii:$d,invoke_viddi:ae,invoke_vidi:be,invoke_vidid:ce,invoke_vii:de,invoke_viid:ee,invoke_viidd:fe,invoke_viiddd:ge,invoke_viidddi:he,invoke_viidddiid:ie,invoke_viiddi:je,invoke_viidi:ke,invoke_viii:le,invoke_viiid:me,invoke_viiiddidii:ne,invoke_viiidid:oe,invoke_viiidiii:pe,invoke_viiidiiii:qe,invoke_viiii:re,invoke_viiiid:se,invoke_viiiidi:te,invoke_viiiidiii:ue,
invoke_viiiii:ve,invoke_viiiiii:we,invoke_viiiiiid:xe,invoke_viiiiiii:ye,invoke_viiiiiiidiiii:ze,invoke_viiiiiiii:Ae,invoke_viiiiiiiii:Be,invoke_viiiiiiiiii:Ce,invoke_viiiiiiiiiii:De,invoke_viiiiiiiiiiii:Ee,invoke_viiiiiiiiiiiii:Fe,invoke_viiiiiiiiiiiiiii:Ge,invoke_viijii:He,invoke_vij:Ie,invoke_vijj:Je,invoke_vjjii:Ke,llvm_eh_typeid_for:a=>a};function le(a,b,c,d){var e=X();try{R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}
function gd(a,b){var c=X();try{return R.get(a)(b)}catch(d){Y(c);if(!(d instanceof u))throw d;Z(1,0)}}function pd(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function de(a,b,c){var d=X();try{R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function ld(a,b,c){var d=X();try{return R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}
function ed(a){var b=X();try{return R.get(a)()}catch(c){Y(b);if(!(c instanceof u))throw c;Z(1,0)}}function re(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Td(a,b){var c=X();try{R.get(a)(b)}catch(d){Y(c);if(!(d instanceof u))throw d;Z(1,0)}}function Md(a,b){var c=X();try{return R.get(a)(b)}catch(d){Y(c);if(!(d instanceof u))throw d;Z(1,0);return 0n}}
function Bc(a,b){var c=X();try{return R.get(a)(b)}catch(d){Y(c);if(!(d instanceof u))throw d;Z(1,0)}}function hd(a,b,c){var d=X();try{return R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function Od(a){var b=X();try{R.get(a)()}catch(c){Y(b);if(!(c instanceof u))throw c;Z(1,0)}}function sd(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function Id(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Kd(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function Hd(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function xd(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}
function Jd(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Rd(a,b,c,d){var e=X();try{R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function fd(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function zd(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}
function Je(a,b,c,d){var e=X();try{R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function Ie(a,b,c){var d=X();try{R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function Ke(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Ld(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}
function wc(a,b){var c=X();try{return R.get(a)(b)}catch(d){Y(c);if(!(d instanceof u))throw d;Z(1,0)}}function ve(a,b,c,d,e,f){var g=X();try{R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function od(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function wd(a,b,c,d,e,f,g,h,k){var l=X();try{return R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}
function ud(a,b,c,d,e,f,g,h,k,l,t){var v=X();try{return R.get(a)(b,c,d,e,f,g,h,k,l,t)}catch(x){Y(v);if(!(x instanceof u))throw x;Z(1,0)}}function vd(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function md(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function xe(a,b,c,d,e,f,g,h){var k=X();try{R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}
function Be(a,b,c,d,e,f,g,h,k,l){var t=X();try{R.get(a)(b,c,d,e,f,g,h,k,l)}catch(v){Y(t);if(!(v instanceof u))throw v;Z(1,0)}}function Ee(a,b,c,d,e,f,g,h,k,l,t,v,x){var y=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v,x)}catch(z){Y(y);if(!(z instanceof u))throw z;Z(1,0)}}function ye(a,b,c,d,e,f,g,h){var k=X();try{R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}
function ze(a,b,c,d,e,f,g,h,k,l,t,v,x){var y=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v,x)}catch(z){Y(y);if(!(z instanceof u))throw z;Z(1,0)}}function Gd(a,b,c){var d=X();try{return R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function Pc(a,b,c){var d=X();try{return R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function fe(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function je(a,b,c,d,e,f){var g=X();try{R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Wc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Tc(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function $c(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}
function we(a,b,c,d,e,f,g){var h=X();try{R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function Ae(a,b,c,d,e,f,g,h,k){var l=X();try{R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function Rc(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function Xc(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}
function De(a,b,c,d,e,f,g,h,k,l,t,v){var x=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v)}catch(y){Y(x);if(!(y instanceof u))throw y;Z(1,0)}}function ae(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Mc(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function Hc(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}
function xc(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function yc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Sd(a,b,c,d,e,f){var g=X();try{R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Ec(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function Ic(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Cc(a,b,c){var d=X();try{return R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function zc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Fc(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}
function jd(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Ud(a,b,c){var d=X();try{R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function ge(a,b,c,d,e,f){var g=X();try{R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function kd(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}
function Yc(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function cd(a,b,c,d,e,f,g,h,k){var l=X();try{return R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function Gc(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function Oc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function Ac(a,b,c){var d=X();try{return R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function Bd(a,b,c,d,e,f,g,h,k){var l=X();try{return R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function Ad(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function qd(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function rd(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function yd(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function Jc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function Vd(a,b,c,d){var e=X();try{R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}
function Kc(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Lc(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function $d(a,b,c,d,e,f,g,h){var k=X();try{R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function ad(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}
function be(a,b,c,d){var e=X();try{R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function Dc(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function nd(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function ce(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function qe(a,b,c,d,e,f,g,h,k){var l=X();try{R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function bd(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function oe(a,b,c,d,e,f,g){var h=X();try{R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function he(a,b,c,d,e,f,g){var h=X();try{R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}
function ne(a,b,c,d,e,f,g,h,k,l){var t=X();try{R.get(a)(b,c,d,e,f,g,h,k,l)}catch(v){Y(t);if(!(v instanceof u))throw v;Z(1,0)}}function Uc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function ie(a,b,c,d,e,f,g,h,k){var l=X();try{R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function me(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function Cd(a,b,c,d,e,f,g,h,k,l){var t=X();try{return R.get(a)(b,c,d,e,f,g,h,k,l)}catch(v){Y(t);if(!(v instanceof u))throw v;Z(1,0)}}function se(a,b,c,d,e,f){var g=X();try{R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function ee(a,b,c,d){var e=X();try{R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}function Dd(a,b,c,d,e,f,g,h,k,l,t){var v=X();try{return R.get(a)(b,c,d,e,f,g,h,k,l,t)}catch(x){Y(v);if(!(x instanceof u))throw x;Z(1,0)}}
function Yd(a,b,c,d,e,f,g,h,k,l,t,v){var x=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v)}catch(y){Y(x);if(!(y instanceof u))throw y;Z(1,0)}}function Zc(a,b,c,d,e,f,g){var h=X();try{return R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function Zd(a,b,c,d,e,f,g,h,k,l,t,v,x){var y=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v,x)}catch(z){Y(y);if(!(z instanceof u))throw z;Z(1,0)}}
function Xd(a,b,c,d,e,f,g,h,k,l){var t=X();try{R.get(a)(b,c,d,e,f,g,h,k,l)}catch(v){Y(t);if(!(v instanceof u))throw v;Z(1,0)}}function Qd(a,b,c,d,e,f,g,h,k){var l=X();try{R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function Vc(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function Wd(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function Fe(a,b,c,d,e,f,g,h,k,l,t,v,x,y){var z=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v,x,y)}catch(D){Y(z);if(!(D instanceof u))throw D;Z(1,0)}}function Ce(a,b,c,d,e,f,g,h,k,l,t){var v=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t)}catch(x){Y(v);if(!(x instanceof u))throw x;Z(1,0)}}function Qc(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}function ke(a,b,c,d,e){var f=X();try{R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0)}}
function te(a,b,c,d,e,f,g){var h=X();try{R.get(a)(b,c,d,e,f,g)}catch(k){Y(h);if(!(k instanceof u))throw k;Z(1,0)}}function pe(a,b,c,d,e,f,g,h){var k=X();try{R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function ue(a,b,c,d,e,f,g,h,k){var l=X();try{R.get(a)(b,c,d,e,f,g,h,k)}catch(t){Y(l);if(!(t instanceof u))throw t;Z(1,0)}}function Nc(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}
function Sc(a,b,c,d,e,f,g,h){var k=X();try{return R.get(a)(b,c,d,e,f,g,h)}catch(l){Y(k);if(!(l instanceof u))throw l;Z(1,0)}}function Pd(a,b,c){var d=X();try{R.get(a)(b,c)}catch(e){Y(d);if(!(e instanceof u))throw e;Z(1,0)}}function He(a,b,c,d,e,f){var g=X();try{R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}function td(a,b,c,d,e,f){var g=X();try{return R.get(a)(b,c,d,e,f)}catch(h){Y(g);if(!(h instanceof u))throw h;Z(1,0)}}
function Nd(a,b,c,d,e){var f=X();try{return R.get(a)(b,c,d,e)}catch(g){Y(f);if(!(g instanceof u))throw g;Z(1,0);return 0n}}function Fd(a,b,c,d,e,f,g,h,k,l,t,v,x){var y=X();try{return R.get(a)(b,c,d,e,f,g,h,k,l,t,v,x)}catch(z){Y(y);if(!(z instanceof u))throw z;Z(1,0)}}function dd(a,b,c,d){var e=X();try{return R.get(a)(b,c,d)}catch(f){Y(e);if(!(f instanceof u))throw f;Z(1,0)}}
function Ed(a,b,c,d,e,f,g,h,k,l,t,v){var x=X();try{return R.get(a)(b,c,d,e,f,g,h,k,l,t,v)}catch(y){Y(x);if(!(y instanceof u))throw y;Z(1,0)}}function Ge(a,b,c,d,e,f,g,h,k,l,t,v,x,y,z,D){var C=X();try{R.get(a)(b,c,d,e,f,g,h,k,l,t,v,x,y,z,D)}catch(H){Y(C);if(!(H instanceof u))throw H;Z(1,0)}}var Me,Ka;
Ka=await (async function(){function a(d){d=Ka=d.exports;n("undefined"!=typeof d.__getTypeName,"missing Wasm export: __getTypeName");n("undefined"!=typeof d.__cxa_free_exception,"missing Wasm export: __cxa_free_exception");n("undefined"!=typeof d.free,"missing Wasm export: free");n("undefined"!=typeof d.malloc,"missing Wasm export: malloc");n("undefined"!=typeof d.fflush,"missing Wasm export: fflush");n("undefined"!=typeof d.__cxa_get_exception_ptr,"missing Wasm export: __cxa_get_exception_ptr");
n("undefined"!=typeof d.emscripten_stack_get_end,"missing Wasm export: emscripten_stack_get_end");n("undefined"!=typeof d.emscripten_stack_get_base,"missing Wasm export: emscripten_stack_get_base");n("undefined"!=typeof d.setThrew,"missing Wasm export: setThrew");n("undefined"!=typeof d._emscripten_tempret_set,"missing Wasm export: _emscripten_tempret_set");n("undefined"!=typeof d.emscripten_stack_init,"missing Wasm export: emscripten_stack_init");n("undefined"!=typeof d.emscripten_stack_get_free,
"missing Wasm export: emscripten_stack_get_free");n("undefined"!=typeof d._emscripten_stack_restore,"missing Wasm export: _emscripten_stack_restore");n("undefined"!=typeof d._emscripten_stack_alloc,"missing Wasm export: _emscripten_stack_alloc");n("undefined"!=typeof d.emscripten_stack_get_current,"missing Wasm export: emscripten_stack_get_current");n("undefined"!=typeof d.__cxa_decrement_exception_refcount,"missing Wasm export: __cxa_decrement_exception_refcount");n("undefined"!=typeof d.__cxa_increment_exception_refcount,
"missing Wasm export: __cxa_increment_exception_refcount");n("undefined"!=typeof d.__get_exception_message,"missing Wasm export: __get_exception_message");n("undefined"!=typeof d.__cxa_can_catch,"missing Wasm export: __cxa_can_catch");n("undefined"!=typeof d.memory,"missing Wasm export: memory");n("undefined"!=typeof d.__indirect_function_table,"missing Wasm export: __indirect_function_table");Jb=F("__getTypeName",1);U=F("free",1);tc=F("malloc",1);uc=F("__cxa_get_exception_ptr",1);pa=d.emscripten_stack_get_end;
Z=F("setThrew",2);Za=F("_emscripten_tempret_set",1);vc=d.emscripten_stack_init;Y=d._emscripten_stack_restore;pc=d._emscripten_stack_alloc;X=d.emscripten_stack_get_current;sc=F("__cxa_decrement_exception_refcount",1);rc=F("__cxa_increment_exception_refcount",1);qc=F("__get_exception_message",3);$a=F("__cxa_can_catch",3);Ia=d.memory;R=d.__indirect_function_table;Ha();return Ka}var b=m,c={env:Le,wasi_snapshot_preview1:Le};if(m.instantiateWasm)return new Promise((d,e)=>{try{m.instantiateWasm(c,(f,g)=>
{d(a(f,g))})}catch(f){p(`Module.instantiateWasm callback failed with error: ${f}`),e(f)}});La??=m.locateFile?m.locateFile?m.locateFile("coolprop.wasm",ha):ha+"coolprop.wasm":(new URL("coolprop.wasm",import.meta.url)).href;return function(d){n(m===b,"the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");b=null;return a(d.instance)}(await Oa(c))}());
(function(){function a(){n(!Me);Me=!0;m.calledRun=!0;if(!na){n(!Ga);Ga=!0;qa();Ka.__wasm_call_ctors();ya?.(m);m.onRuntimeInitialized?.();wa("onRuntimeInitialized");n(!m._main,'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');qa();if(m.postRun)for("function"==typeof m.postRun&&(m.postRun=[m.postRun]);m.postRun.length;){var b=m.postRun.shift();Qa.push(b)}wa("postRun");Pa(Qa)}}vc();oa();if(m.preRun)for("function"==typeof m.preRun&&(m.preRun=[m.preRun]);m.preRun.length;)Sa();
wa("preRun");Pa(Ra);m.setStatus?(m.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>m.setStatus(""),1);a()},1)):a();qa()})();Ga?moduleRtn=m:moduleRtn=new Promise((a,b)=>{ya=a;za=b});for(const a of Object.keys(m))a in moduleArg||Object.defineProperty(moduleArg,a,{configurable:!0,get(){q(`Access to module property ('${a}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`)}});
;return moduleRtn}


const FLUIDS=Object.freeze({
  R717:'Ammonia',
  R134a:'R134a',
  R1234yf:'R1234yf',
  R32:'R32',
  R410A:'R410A',
  R290:'Propane',
  R600a:'Isobutane',
  R744:'CarbonDioxide'
});
const PROVIDER_ID='CoolProp-7.2.1dev-HEOS';
const EXPECTED_VERSION='7.2.1dev';
const EXPECTED_GITREV='45cb09d9256c0854c36e5834aec7218bbde7ff10';
const FACTORY_SHA256='9ff287805dd8a36c9a9f48013eda6e32a61a6641e2a9715e0cc83d0150207bfb';
const WASM_SHA256='ba7481b953c57b2d3ce77df3d351fd589f534f8f660a3adcd35afc95fd50ce8d';
const WASM_BYTES=6544434;

let moduleInstance=null;
let wasmBytes=null;
let initPromise=null;
let runtimeIdentity=null;


function toU8(x){
  if(x instanceof Uint8Array)return x;
  if(x instanceof ArrayBuffer)return new Uint8Array(x);
  if(ArrayBuffer.isView(x))return new Uint8Array(x.buffer,x.byteOffset,x.byteLength);
  throw new Error('CoolProp wasmBinary must be ArrayBuffer or Uint8Array');
}
function sha256Fallback(bytes){
  const u=toU8(bytes), K=new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const bitLen=BigInt(u.length)*8n, total=((u.length+9+63)>>6)<<6, msg=new Uint8Array(total); msg.set(u); msg[u.length]=0x80;
  for(let i=0;i<8;i++)msg[total-1-i]=Number((bitLen>>BigInt(8*i))&255n);
  const W=new Uint32Array(64), rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<total;off+=64){
    for(let i=0;i<16;i++){const j=off+4*i;W[i]=((msg[j]<<24)|(msg[j+1]<<16)|(msg[j+2]<<8)|msg[j+3])>>>0;}
    for(let i=16;i<64;i++){const x=W[i-15],y=W[i-2],s0=(rotr(x,7)^rotr(x,18)^(x>>>3))>>>0,s1=(rotr(y,17)^rotr(y,19)^(y>>>10))>>>0;W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0,ch=((e&f)^((~e)&g))>>>0,t1=(h+S1+ch+K[i]+W[i])>>>0;
      const S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0,maj=((a&b)^(a&c)^(b&c))>>>0,t2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return Array.from(H,x=>x.toString(16).padStart(8,'0')).join('');
}
async function sha256Hex(bytes){
  const u=toU8(bytes);
  if(globalThis.crypto&&globalThis.crypto.subtle){const d=await globalThis.crypto.subtle.digest('SHA-256',u);return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
  return sha256Fallback(u);
}
async function verifyWasm(bytes){
  const u=toU8(bytes);if(u.byteLength!==WASM_BYTES)throw new Error(`CoolProp WASM byte length mismatch: ${u.byteLength} != ${WASM_BYTES}`);
  const hash=await sha256Hex(u);if(hash!==WASM_SHA256)throw new Error(`CoolProp WASM SHA-256 mismatch: ${hash}`);return hash;
}

function finite(name,v){
  v=+v;
  if(!Number.isFinite(v))throw new Error(name+' must be finite');
  return v;
}
function fluidName(id){
  id=String(id||'');
  const name=FLUIDS[id];
  if(!name)throw new Error('unsupported refrigerantId: '+id);
  return name;
}
function prop(out,a,av,b,bv,fluid){
  const v=moduleInstance.PropsSI(out,a,av,b,bv,fluid);
  if(!Number.isFinite(v))throw new Error(`CoolProp ${out} returned non-finite value`);
  return v;
}
function qualitySafe(a,av,b,bv,fluid){
  try{
    const q=moduleInstance.PropsSI('Q',a,av,b,bv,fluid);
    return Number.isFinite(q)&&q>=-1e-9&&q<=1+1e-9?Math.min(1,Math.max(0,q)):null;
  }catch(e){return null;}
}
function phaseFromQuality(q){
  if(q==null)return 'unknown';
  if(q<=1e-9)return 'liquid';
  if(q>=1-1e-9)return 'vapor';
  return 'two_phase';
}
function pairInputs(request){
  const pair=String(request.pair||request.inputPair||'').toUpperCase();
  if(pair==='PT')return{pair,a:'P',av:finite('pressure_Pa',request.pressure_Pa),b:'T',bv:finite('temperature_K',request.temperature_K)};
  if(pair==='PH')return{pair,a:'P',av:finite('pressure_Pa',request.pressure_Pa),b:'Hmass',bv:finite('enthalpy_J_kg',request.enthalpy_J_kg)};
  if(pair==='PQ')return{pair,a:'P',av:finite('pressure_Pa',request.pressure_Pa),b:'Q',bv:finite('quality',request.quality)};
  if(pair==='TQ')return{pair,a:'T',av:finite('temperature_K',request.temperature_K),b:'Q',bv:finite('quality',request.quality)};
  if(pair==='PS')return{pair,a:'P',av:finite('pressure_Pa',request.pressure_Pa),b:'Smass',bv:finite('entropy_J_kgK',request.entropy_J_kgK)};
  throw new Error('unsupported input pair: '+pair);
}
function resolve(request={}){
  if(!moduleInstance)throw new Error('ThermalCoolPropProvider is not initialized');
  const refrigerantId=String(request.refrigerantId||request.fluidId||'');
  const fluid=fluidName(refrigerantId),i=pairInputs(request);
  if((i.pair==='PQ'||i.pair==='TQ')&&(i.bv<0||i.bv>1))throw new Error('quality must be in [0,1]');
  const p=prop('P',i.a,i.av,i.b,i.bv,fluid);
  const T=prop('T',i.a,i.av,i.b,i.bv,fluid);
  const h=prop('Hmass',i.a,i.av,i.b,i.bv,fluid);
  const s=prop('Smass',i.a,i.av,i.b,i.bv,fluid);
  const rho=prop('Dmass',i.a,i.av,i.b,i.bv,fluid);
  const q=(i.pair==='PQ'||i.pair==='TQ')?i.bv:qualitySafe(i.a,i.av,i.b,i.bv,fluid);
  return{
    family:'refrigerant',
    fluidId:refrigerantId,
    refrigerantId,
    pressure_Pa:p,
    temperature_K:T,
    temperature_C:T-273.15,
    enthalpy_J_kg:h,
    entropy_J_kgK:s,
    density_kg_m3:rho,
    quality:q,
    phase:phaseFromQuality(q),
    propertyModelId:PROVIDER_ID,
    provenance:{
      provider:PROVIDER_ID,
      backend:'HEOS',
      version:runtimeIdentity.version,
      gitrevision:runtimeIdentity.gitrevision,
      factory_sha256:FACTORY_SHA256,
      wasm_sha256:WASM_SHA256
    }
  };
}
function isentropicDischarge({suctionState,dischargePressure_Pa,isentropeEfficiency}={}){
  if(!suctionState)throw new Error('suctionState required');
  const eta=finite('isentropeEfficiency',isentropeEfficiency);
  if(!(eta>0&&eta<=1))throw new Error('isentropeEfficiency must be in (0,1]');
  const refrigerantId=String(suctionState.refrigerantId||suctionState.fluidId||'');
  const p2=finite('dischargePressure_Pa',dischargePressure_Pa);
  const s1=finite('suctionState.entropy_J_kgK',suctionState.entropy_J_kgK);
  const h1=finite('suctionState.enthalpy_J_kg',suctionState.enthalpy_J_kg);
  const isentropicState=resolve({refrigerantId,pair:'PS',pressure_Pa:p2,entropy_J_kgK:s1});
  const h2=h1+(isentropicState.enthalpy_J_kg-h1)/eta;
  const actualState=resolve({refrigerantId,pair:'PH',pressure_Pa:p2,enthalpy_J_kg:h2});
  return{isentropicState,actualState,isentropeEfficiency:eta};
}
function identity(){
  if(!runtimeIdentity)throw new Error('ThermalCoolPropProvider is not initialized');
  return{...runtimeIdentity,factory_sha256:FACTORY_SHA256,wasm_sha256:WASM_SHA256,provider:PROVIDER_ID};
}
async function obtainWasm(){
  if(wasmBytes)return wasmBytes;
  const injected=globalThis.__THERMAL_COOLPROP_WASM_BINARY__;
  if(injected){
    wasmBytes=injected instanceof Uint8Array?new Uint8Array(injected):new Uint8Array(injected);
    return wasmBytes;
  }
  const override=globalThis.__THERMAL_COOLPROP_WASM_URL__;
  const url=override||new URL('thermodynamiccycles.wasm',import.meta.url).href;
  const r=await fetch(url,{credentials:'same-origin'});
  if(!r.ok)throw new Error('CoolProp WASM fetch failed: HTTP '+r.status);
  wasmBytes=new Uint8Array(await r.arrayBuffer());
  return wasmBytes;
}
async function init(){
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    const bin=await obtainWasm();
    const verifiedWasmSha256=await verifyWasm(bin);
    moduleInstance=await CoolPropModule({wasmBinary:bin,locateFile:p=>p});
    const version=String(moduleInstance.get_global_param_string('version'));
    const gitrevision=String(moduleInstance.get_global_param_string('gitrevision'));
    if(version!==EXPECTED_VERSION)throw new Error(`CoolProp version mismatch: ${version} != ${EXPECTED_VERSION}`);
    if(gitrevision!==EXPECTED_GITREV)throw new Error(`CoolProp gitrevision mismatch: ${gitrevision} != ${EXPECTED_GITREV}`);
    runtimeIdentity={version,gitrevision,verifiedWasmSha256};
    return api;
  })();
  return initPromise;
}

function phaseWorkerPreamble(){
  return `${CoolPropModule.toString()}
const __CP_FLUIDS=${JSON.stringify(FLUIDS)};
const __CP_PROVIDER_ID=${JSON.stringify(PROVIDER_ID)};
const __CP_VERSION=${JSON.stringify(EXPECTED_VERSION)};
const __CP_GITREV=${JSON.stringify(EXPECTED_GITREV)};
const __CP_WASM_SHA=${JSON.stringify(WASM_SHA256)};
const __CP_WASM_BYTES=${WASM_BYTES};
let __cpM=null;
function __cpFinite(name,v){v=+v;if(!Number.isFinite(v))throw new Error(name+' must be finite');return v;}
function __cpFluidName(id){id=String(id||'');const name=__CP_FLUIDS[id];if(!name)throw new Error('unsupported refrigerantId: '+id);return name;}
function __cpProp(out,a,av,b,bv,fluid){const v=__cpM.PropsSI(out,a,av,b,bv,fluid);if(!Number.isFinite(v))throw new Error('CoolProp '+out+' returned non-finite value');return v;}
function __cpQualitySafe(a,av,b,bv,fluid){try{const q=__cpM.PropsSI('Q',a,av,b,bv,fluid);return Number.isFinite(q)&&q>=-1e-9&&q<=1+1e-9?Math.min(1,Math.max(0,q)):null;}catch(e){return null;}}
function __cpPhase(q){if(q==null)return 'unknown';if(q<=1e-9)return 'liquid';if(q>=1-1e-9)return 'vapor';return 'two_phase';}
function __cpPair(r){const pair=String(r.pair||r.inputPair||'').toUpperCase();if(pair==='PT')return{pair,a:'P',av:__cpFinite('pressure_Pa',r.pressure_Pa),b:'T',bv:__cpFinite('temperature_K',r.temperature_K)};if(pair==='PH')return{pair,a:'P',av:__cpFinite('pressure_Pa',r.pressure_Pa),b:'Hmass',bv:__cpFinite('enthalpy_J_kg',r.enthalpy_J_kg)};if(pair==='PQ')return{pair,a:'P',av:__cpFinite('pressure_Pa',r.pressure_Pa),b:'Q',bv:__cpFinite('quality',r.quality)};if(pair==='TQ')return{pair,a:'T',av:__cpFinite('temperature_K',r.temperature_K),b:'Q',bv:__cpFinite('quality',r.quality)};if(pair==='PS')return{pair,a:'P',av:__cpFinite('pressure_Pa',r.pressure_Pa),b:'Smass',bv:__cpFinite('entropy_J_kgK',r.entropy_J_kgK)};throw new Error('unsupported input pair: '+pair);}
function __cpResolve(r={}){const refrigerantId=String(r.refrigerantId||r.fluidId||''),fluid=__cpFluidName(refrigerantId),i=__cpPair(r);if((i.pair==='PQ'||i.pair==='TQ')&&(i.bv<0||i.bv>1))throw new Error('quality must be in [0,1]');const p=__cpProp('P',i.a,i.av,i.b,i.bv,fluid),T=__cpProp('T',i.a,i.av,i.b,i.bv,fluid),h=__cpProp('Hmass',i.a,i.av,i.b,i.bv,fluid),s=__cpProp('Smass',i.a,i.av,i.b,i.bv,fluid),rho=__cpProp('Dmass',i.a,i.av,i.b,i.bv,fluid),q=(i.pair==='PQ'||i.pair==='TQ')?i.bv:__cpQualitySafe(i.a,i.av,i.b,i.bv,fluid);return{family:'refrigerant',fluidId:refrigerantId,refrigerantId,pressure_Pa:p,temperature_K:T,temperature_C:T-273.15,enthalpy_J_kg:h,entropy_J_kgK:s,density_kg_m3:rho,quality:q,phase:__cpPhase(q),propertyModelId:__CP_PROVIDER_ID,provenance:{provider:__CP_PROVIDER_ID,backend:'HEOS',version:__CP_VERSION,gitrevision:__CP_GITREV,wasm_sha256:__CP_WASM_SHA}};}
function __cpIsentropic({suctionState,dischargePressure_Pa,isentropeEfficiency}={}){if(!suctionState)throw new Error('suctionState required');const eta=__cpFinite('isentropeEfficiency',isentropeEfficiency);if(!(eta>0&&eta<=1))throw new Error('isentropeEfficiency must be in (0,1]');const refrigerantId=String(suctionState.refrigerantId||suctionState.fluidId||''),p2=__cpFinite('dischargePressure_Pa',dischargePressure_Pa),s1=__cpFinite('suctionState.entropy_J_kgK',suctionState.entropy_J_kgK),h1=__cpFinite('suctionState.enthalpy_J_kg',suctionState.enthalpy_J_kg),isentropicState=__cpResolve({refrigerantId,pair:'PS',pressure_Pa:p2,entropy_J_kgK:s1}),h2=h1+(isentropicState.enthalpy_J_kg-h1)/eta,actualState=__cpResolve({refrigerantId,pair:'PH',pressure_Pa:p2,enthalpy_J_kg:h2});return{isentropicState,actualState,isentropeEfficiency:eta};}
${toU8.toString()}
${sha256Fallback.toString()}
${sha256Hex.toString()}
async function __thermalCoolPropInitPhaseProvider(payload){const bin=toU8(payload&&payload.wasmBinary);if(bin.byteLength!==__CP_WASM_BYTES)throw new Error('CoolProp Worker WASM byte length mismatch');const hash=await sha256Hex(bin);if(hash!==__CP_WASM_SHA)throw new Error('CoolProp Worker WASM SHA-256 mismatch: '+hash);__cpM=await CoolPropModule({wasmBinary:bin,locateFile:p=>p});const version=String(__cpM.get_global_param_string('version')),gitrevision=String(__cpM.get_global_param_string('gitrevision'));if(version!==__CP_VERSION||gitrevision!==__CP_GITREV)throw new Error('CoolProp Worker runtime identity mismatch');globalThis.__THERMAL_PHASE_PROVIDERS__={refrigerant:{modelId:__CP_PROVIDER_ID,resolve:__cpResolve,isentropicDischarge:__cpIsentropic}};return{version,gitrevision,wasmSha256:hash};}
`;
}
async function createThermalCandidateEnsemble(core,computeApi,options={}){
  await init();
  if(!core||typeof core.thermalWorkerPreamble!=='function'||typeof core.onEvaluateCandidateCase!=='function')throw new Error('ThermalCore candidate Worker API unavailable');
  if(!computeApi||typeof computeApi.ComputeRuntime!=='function'||typeof computeApi.createEnsembleWorkerSource!=='function')throw new Error('DiagramCompute candidate Worker API unavailable');
  const runtime=await computeApi.ComputeRuntime.create({benchmark:false}),caps=runtime.capabilities||{};
  if(!caps.cpu||!caps.cpu.workerAvailable)throw new Error('this context has no Worker constructor');
  const workers=Math.max(1,Math.trunc(options.workers??runtime.getWorkerCount()));
  const preamble=core.thermalWorkerPreamble(phaseWorkerPreamble());
  const initializer=function(payload){return __thermalCoolPropInitPhaseProvider(payload);};
  const source=computeApi.createEnsembleWorkerSource(core.onEvaluateCandidateCase,{preamble,initializer});
  const ensemble=runtime.createEnsembleEngine({prefix:options.prefix??'thermaloptimizer-coolprop'});
  const spec={workers,poolKey:(options.prefix??'thermaloptimizer-coolprop')+':candidate',determinism:'repeatable',primitives:[{kind:'ensemble',factor:1}],source,type:'module',initPayload:{wasmBinary:(await obtainWasm()).slice()}};
  if(options.workerFactory)spec.workerFactory=()=>options.workerFactory(source);
  ensemble.registerEnsemble('candidate',spec);ensemble.__thermalPhaseProviderKinds=['refrigerant'];
  return{runtime,ensemble,workers,workerSource:source,phaseProviderKinds:['refrigerant']};
}

function workerSource(){
  return `${CoolPropModule.toString()}
const FLUIDS=${JSON.stringify(FLUIDS)};
const PROVIDER_ID=${JSON.stringify(PROVIDER_ID)};
const WASM_SHA256=${JSON.stringify(WASM_SHA256)},WASM_BYTES=${WASM_BYTES};
${toU8.toString()}
${sha256Fallback.toString()}
${sha256Hex.toString()}
let M=null,identity=null;
${finite.toString()}
${fluidName.toString()}
function prop(out,a,av,b,bv,fluid){const v=M.PropsSI(out,a,av,b,bv,fluid);if(!Number.isFinite(v))throw new Error('CoolProp '+out+' returned non-finite value');return v;}
function qualitySafe(a,av,b,bv,fluid){try{const q=M.PropsSI('Q',a,av,b,bv,fluid);return Number.isFinite(q)&&q>=-1e-9&&q<=1+1e-9?Math.min(1,Math.max(0,q)):null;}catch(e){return null;}}
${phaseFromQuality.toString()}
${pairInputs.toString()}
function resolve(request={}){const refrigerantId=String(request.refrigerantId||request.fluidId||'');const fluid=fluidName(refrigerantId),i=pairInputs(request);if((i.pair==='PQ'||i.pair==='TQ')&&(i.bv<0||i.bv>1))throw new Error('quality must be in [0,1]');const p=prop('P',i.a,i.av,i.b,i.bv,fluid),T=prop('T',i.a,i.av,i.b,i.bv,fluid),h=prop('Hmass',i.a,i.av,i.b,i.bv,fluid),s=prop('Smass',i.a,i.av,i.b,i.bv,fluid),rho=prop('Dmass',i.a,i.av,i.b,i.bv,fluid),q=(i.pair==='PQ'||i.pair==='TQ')?i.bv:qualitySafe(i.a,i.av,i.b,i.bv,fluid);return{family:'refrigerant',fluidId:refrigerantId,refrigerantId,pressure_Pa:p,temperature_K:T,temperature_C:T-273.15,enthalpy_J_kg:h,entropy_J_kgK:s,density_kg_m3:rho,quality:q,phase:phaseFromQuality(q),propertyModelId:PROVIDER_ID};}
self.onmessage=async ev=>{try{const d=ev.data;if(d.kind==='init'){const bin=new Uint8Array(d.wasm);if(bin.byteLength!==WASM_BYTES)throw new Error('CoolProp Worker WASM byte length mismatch');const hash=await sha256Hex(bin);if(hash!==WASM_SHA256)throw new Error('CoolProp Worker WASM SHA-256 mismatch: '+hash);M=await CoolPropModule({wasmBinary:bin,locateFile:p=>p});identity={version:String(M.get_global_param_string('version')),gitrevision:String(M.get_global_param_string('gitrevision')),verifiedWasmSha256:hash};self.postMessage({ok:true,kind:'ready',identity});return;}if(d.kind==='resolve'){self.postMessage({ok:true,kind:'resolved',id:d.id,state:resolve(d.request)});return;}if(d.kind==='matrix'){self.postMessage({ok:true,kind:'matrix',identity,states:d.requests.map(resolve)});return;}throw new Error('unknown message kind');}catch(e){self.postMessage({ok:false,error:String(e&&e.stack||e)});}};`;
}
async function runWorkerParity(requests){
  await init();
  if(!Array.isArray(requests)||!requests.length)throw new Error('requests required');
  const src=workerSource(),url='data:text/javascript;charset=utf-8,'+encodeURIComponent(src);
  try{
    const worker=new Worker(url,{type:'module'});
    const once=()=>new Promise((resolve,reject)=>{
      const onMsg=e=>{cleanup();e.data&&e.data.ok?resolve(e.data):reject(new Error(e.data?.error||'worker failed'));};
      const onErr=e=>{cleanup();reject(new Error(e.message||'worker error'));};
      const cleanup=()=>{worker.removeEventListener('message',onMsg);worker.removeEventListener('error',onErr);};
      worker.addEventListener('message',onMsg);worker.addEventListener('error',onErr);
    });
    const bin=(await obtainWasm()).slice();
    const p0=once();worker.postMessage({kind:'init',wasm:bin.buffer},[bin.buffer]);const ready=await p0;
    const p1=once();worker.postMessage({kind:'matrix',requests});const w=await p1;
    const main=requests.map(resolve);
    const keys=['pressure_Pa','temperature_K','enthalpy_J_kg','entropy_J_kgK','density_kg_m3','quality'];
    let comparisons=0,maxAbs=0,maxRel=0,mismatchCount=0;
    for(let i=0;i<main.length;i++)for(const k of keys){
      const a=main[i][k],b=w.states[i][k];
      if(a==null&&b==null)continue;
      comparisons++;
      if(typeof a==='number'&&typeof b==='number'){
        const ae=Math.abs(a-b),re=ae/Math.max(1,Math.abs(a),Math.abs(b));maxAbs=Math.max(maxAbs,ae);maxRel=Math.max(maxRel,re);if(a!==b)mismatchCount++;
      }else if(a!==b)mismatchCount++;
    }
    worker.terminate();
    return{pass:mismatchCount===0&&w.identity.version===runtimeIdentity.version&&w.identity.gitrevision===runtimeIdentity.gitrevision,comparisons,maxAbs,maxRel,mismatchCount,mainIdentity:identity(),workerIdentity:w.identity};
  }finally{}
}
const api=Object.freeze({
  id:PROVIDER_ID,
  supportedRefrigerants:Object.freeze(Object.keys(FLUIDS)),
  init,
  ready:init,
  identity,
  resolve,
  isentropicDischarge,
  runWorkerParity,
  workerSource,
  phaseWorkerPreamble,
  createThermalCandidateEnsemble,
  sha256Hex
});
globalThis.ThermalCoolPropProvider=api;
globalThis.__THERMAL_COOLPROP_READY__=init();
if(globalThis.Diagram&&typeof globalThis.Diagram.ready==='function')globalThis.Diagram.ready(globalThis.__THERMAL_COOLPROP_READY__);
