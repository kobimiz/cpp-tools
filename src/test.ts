import { Queue } from "./queue";

const Parser = require('tree-sitter')
const CPP = require('tree-sitter-cpp')
const fs = require('fs')

const parser = new Parser();
parser.setLanguage(CPP);

// const source = 'void setData(std::vector<float>&& data, int x, double, float z = 1);'
const source = fs.readFileSync('/home/kobi/Desktop/cppTestProject/internal/character.h').toString()

const tree = parser.parse(source).rootNode

function x(node) {
    for (let i = 0; i < node.childCount; i++) {
        x(node.child(i))
    }
    // if (node.type == 'function_declarator') {
        console.log("'" + node.text + "'" + " '" + node.type + "'");
        // x(node)
    // }
}



function BFS(root) {
    let q = new Queue()
    let level = 0
    console.log('\nlevel ' + level);
    q.enqueue({node:root, currLevel: 0})
    while (!q.isEmpty()) {
        let item = q.dequeue()
        let node = item.node
        let currLevel = item.currLevel

        for (let i = 0; i < node.childCount; i++) {
            let pushed = {node: node.child(i), currLevel: currLevel + 1}
            q.enqueue(pushed)
        }
        if (currLevel > level) {
            console.log('\nlevel ' + currLevel);
            level = currLevel
        }
        
        console.log(node.text, "'" + node.type + "'");
    }
}
let classSpe = tree.descendantsOfType('class_specifier')

for (let i = 0; i < classSpe.length; i++) {
    console.log(classSpe[i].text, "'" + classSpe[i].type + "'");    
}

function parseClass(classSpecifierNode) {
    
}

// BFS(classSpe[0])
BFS(tree)
