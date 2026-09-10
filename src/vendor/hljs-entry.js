// highlight.js 自定义打包入口：core + 常用语言，打成 IIFE 供单文件 HTML 内联
import hljs from 'highlight.js/lib/core';

import apache from 'highlight.js/lib/languages/apache';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cmake from 'highlight.js/lib/languages/cmake';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import django from 'highlight.js/lib/languages/django';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import erlang from 'highlight.js/lib/languages/erlang';
import go from 'highlight.js/lib/languages/go';
import gradle from 'highlight.js/lib/languages/gradle';
import graphql from 'highlight.js/lib/languages/graphql';
import haskell from 'highlight.js/lib/languages/haskell';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import latex from 'highlight.js/lib/languages/latex';
import less from 'highlight.js/lib/languages/less';
import lua from 'highlight.js/lib/languages/lua';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import matlab from 'highlight.js/lib/languages/matlab';
import nginx from 'highlight.js/lib/languages/nginx';
import objectivec from 'highlight.js/lib/languages/objectivec';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import properties from 'highlight.js/lib/languages/properties';
import protobuf from 'highlight.js/lib/languages/protobuf';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import vbnet from 'highlight.js/lib/languages/vbnet';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const langs = {
  apache, bash, c, cmake, cpp, csharp, css, dart, diff, django, dockerfile, dos,
  erlang, go, gradle, graphql, haskell, http, ini, java, javascript, json, kotlin,
  latex, less, lua, makefile, markdown, matlab, nginx, objectivec, perl, php,
  plaintext, powershell, properties, protobuf, python, r, ruby, rust, scala, scss,
  shell, sql, swift, typescript, vbnet, xml, yaml,
};

Object.keys(langs).forEach((name) => hljs.registerLanguage(name, langs[name]));

hljs.registerAliases(['sh', 'zsh', 'console', 'shellsession'], { languageName: 'bash' });
hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs', 'node'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['py', 'gyp', 'ipython'], { languageName: 'python' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['html', 'xhtml', 'vue', 'svg', 'xml'], { languageName: 'xml' });
hljs.registerAliases(['md', 'mdown', 'mkd'], { languageName: 'markdown' });
hljs.registerAliases(['c++', 'cc', 'hpp', 'hh', 'h'], { languageName: 'cpp' });
hljs.registerAliases(['docker'], { languageName: 'dockerfile' });
hljs.registerAliases(['ps', 'ps1'], { languageName: 'powershell' });
hljs.registerAliases(['bat', 'cmd', 'batch'], { languageName: 'dos' });
hljs.registerAliases(['txt', 'text', 'log'], { languageName: 'plaintext' });
hljs.registerAliases(['golang'], { languageName: 'go' });
hljs.registerAliases(['rs'], { languageName: 'rust' });
hljs.registerAliases(['rb', 'gemfile'], { languageName: 'ruby' });
hljs.registerAliases(['cs'], { languageName: 'csharp' });
hljs.registerAliases(['objc', 'm', 'mm'], { languageName: 'objectivec' });
hljs.registerAliases(['conf'], { languageName: 'nginx' });
hljs.registerAliases(['toml'], { languageName: 'ini' });
hljs.registerAliases(['tex'], { languageName: 'latex' });
hljs.registerAliases(['patch', 'udiff'], { languageName: 'diff' });
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' });
hljs.registerAliases(['make', 'mk'], { languageName: 'makefile' });

window.hljs = hljs;
