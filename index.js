const fs = require('fs');
const path = require('path');
const CWD = process.cwd();
const VAR_REG = /\{\{\s*([\w\d$_]+(?:\.[\w\d$_]+)*)\s*\}\}/g;

function parseTpl(tpl) {
  VAR_REG.exec(null); // reset

  let m;
  let got = false;
  let fn_body = [];
  let pi = 0;
  while((m = VAR_REG.exec(tpl))) {
    if (pi !== m.index) {
      fn_body.push(JSON.stringify(tpl.substring(pi, m.index)));
    }
    pi = m.index + m[0].length;
    fn_body.push(`__template_context.${m[1]}`);
    got = true;
  }
  if (pi !== tpl.length) {
    fn_body.push(JSON.stringify(tpl.substring(pi)))
  }

  if (!got) {
    return tpl;
  }

  return new Function('__template_context', `return ${fn_body.join(' + \n')}`);
}


const DEFAULT_LOCALE = 'en';

class AssetService {
  constructor(config) {
    this.logger = config.logger;
    this._path = config.path;
    this._locales = new Map();
    this._emails = new Map();
    this._scan();
  }
  _scan() {
    let DIR = path.join(this._path, 'locale');
    fs.readdirSync(DIR).forEach(locale => {
      let output = new Map();
      let dir = path.join(DIR, locale);
      if (!fs.statSync(dir).isDirectory()) {
        return;
      }
      fs.readdirSync(dir).forEach(file => {
        if (!/\.json$/.test(file)) {
          return;
        }
        let cnt = fs.readFileSync(path.join(dir, file), 'utf-8');
        try {
          let dict = JSON.parse(cnt);
          for(let key in dict) {
            let okey = file === 'common.json' ? key : file.substring(0, file.lastIndexOf('.') + 1) + key;
            if (output.has(okey)) {
              throw `Locale dict key ${okey} duplicated`;
            }
            output.set(okey, dict[key]);
          }
        } catch(ex) {
          this.logger.error(`Parse locale json file ${locale}/${file} error.`);
          this.logger.error(ex);
        }
      });
      this._locales.set(locale, output);
    });

    DIR = path.join(this._path, 'email');
    fs.readdirSync(DIR).forEach(locale => {
      let localeDir = path.join(DIR, locale);
      let stat = fs.statSync(localeDir);
      if (!stat.isDirectory()) {
        return;
      }
      let map = new Map();
      this._emails.set(locale, map);
      fs.readdirSync(localeDir).forEach(file => {
        if (!/\.html$/.test(file)) {
          return;
        }
        let id = path.basename(file, '.html');
        let cnt = fs.readFileSync(path.join(localeDir, file), 'utf-8');
        let tpl = parseTpl(cnt);
        map.set(id, tpl);
      });
    });
  }
  i18n(locale, key) {
    let dict = this._locales.has(locale) ? this._locales.get(locale) : this._locales.get(DEFAULT_LOCALE);
    return dict.has(key) ? dict.get(key) : key;
  }
  email(locale, templateId, renderContext) {
    let map = this._emails.has(locale) ? this._emails.get(locale) : this._emails.get(DEFAULT_LOCALE);
    let tpl = map.get(templateId);
    if (typeof tpl !== 'function') {
      return tpl;
    }
    return tpl(renderContext);
  }
}

module.exports = AssetService;
