const tsPack = require('@kreuzberg/tree-sitter-language-pack');
async function run() {
  await tsPack.download(['ruby', 'cpp']);
  console.log(tsPack.parseString('ruby', "require 'json'").rootNode.toString());
  console.log(tsPack.parseString('cpp', "#include <iostream>").rootNode.toString());
}
run();
