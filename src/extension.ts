// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Parser from 'tree-sitter'
import * as CPP from 'tree-sitter-cpp'
import * as fs from 'fs'
import path = require('path');
import { Method, Variable } from './method'

const types = {
    FUNC_DECLARATOR: 'function_declarator',
    FUNC_DEFINITIONS: 'function_definition',
    PARAMETER_LIST: 'parameter_list',
    PRIMITIVE_TYPE: 'primitive_type',
    IDENTIFIER: 'identifier',
    QUALIFIED_IDENTIFIER: 'qualified_identifier', // for special members (methods without names)
    FIELD_DECLARATOR: 'field_declaration', // for header files
    FIELD_IDENTIFIER: 'field_identifier' // for header files
}

// TODO generate getters and setters
// TODO emmet like completions
// TODO support const functions

const parser = new Parser();
parser.setLanguage(CPP);

function getHeaderFunctions(source) {
    const tree = parser.parse(source);
    let declarations : Method[] = tree.rootNode.descendantsOfType(types.FIELD_DECLARATOR)
        .filter(field => field.descendantsOfType('class').length == 0)
        .filter(field => field.descendantsOfType('struct').length == 0)
        .filter(field => field.descendantsOfType('parameter_list').length != 0)
        .map(field => {
            let isPureVirtual = false
            let function_declarator = field.descendantsOfType('function_declarator')[0]
            if (function_declarator.nextSibling && function_declarator.nextSibling.text == '=' 
                && function_declarator.nextSibling.nextSibling && function_declarator.nextSibling.nextSibling.text == '0')
                isPureVirtual = true

            let classes = getClassNode(field).map(_class => _class.text.replace(/\s/g, ''))
            let name = field.descendantsOfType('destructor_name')[0];
            if (!name)
            name = field.descendantsOfType('field_identifier')[0];
            if (!name)
            name = field.descendantsOfType('operator_name')[0];

            let returnType = field.text.substring(0, field.text.indexOf(name.text)).trim()
            // TODO better
            if (returnType.length > "static ".length && returnType.substring(0, "static ".length) == "static ")
                returnType = returnType.replace('static', '').replace(/\s/g, '')
            if (returnType.length > "virtual ".length && returnType.substring(0, "virtual ".length) == "virtual ")
                returnType = returnType.replace('virtual', '').replace(/\s/g, '')

            let parameters : Variable[] = field.descendantsOfType('parameter_list')[0]
                .descendantsOfType('parameter_declaration').map(parameter => {
                    let identifier = parameter.descendantsOfType('identifier')
                    let type;
                    let displayType;
                    let name = '';
                    if (identifier.length != 0) {
                        // the parameter is named
                        displayType = parameter.text.substring(0, parameter.text.lastIndexOf(' '))
                        type = displayType.replace(/\s/g, '')                    
                        name = identifier[0].text
                    } else
                        type = parameter.text.replace(/\s/g, '')
                    return new Variable(name, type, displayType)
                })
            return new Method(returnType, classes, name.text, parameters, isPureVirtual)
        })

    // add constructors and desctructors
    let constructors : Method[] = tree.rootNode.descendantsOfType('declaration').map(constructor => {
        let name = constructor.descendantsOfType('identifier')[0]
        let destName = constructor.descendantsOfType('destructor_name')
        if (destName.length != 0){
            name = destName[0]
        }
        let classes = getClassNode(constructor).map(_class => _class.text.replace(/\s/g, ''))
        let returnType = ""
        let parameters : Variable[] = constructor.descendantsOfType('parameter_list')[0]
            .descendantsOfType('parameter_declaration').map(parameter => {
                let identifier = parameter.descendantsOfType('identifier')
                let type;
                let originalType;
                let name = '';
                if (identifier.length != 0) {
                    // the parameter is named
                    originalType = parameter.text.substring(0, parameter.text.lastIndexOf(' '))
                    type = originalType.replace(/\s/g, '')                    
                    name = identifier[0].text
                } else
                    type = parameter.text.replace(/\s/g, '')
                return new Variable(name, type, originalType)
            })
        // add parameters that have optional value
        let optionalParameters : Variable[] = constructor.descendantsOfType('=').map(optionalParameter => {
            let name = optionalParameter.previousSibling.text
            let type = optionalParameter.previousSibling.previousSibling.text
            return new Variable(name, type, type)
        })
        parameters = parameters.concat(optionalParameters)
        return new Method(returnType, classes, name.text, parameters, false)
    })
    declarations = constructors.concat(declarations)
    return declarations
}

function getCPPFunctions(source) {
    const tree = parser.parse(source);

    let definitions = tree.rootNode.descendantsOfType(types.FUNC_DEFINITIONS)
    definitions = definitions.map(definition => definition.descendantsOfType(types.FUNC_DECLARATOR)).flat(1)
    let functions = definitions.map(definition => {
        // check if class method
        // TODO better and handle templates and specific templates definitions
        let classes = []
        let name = definition.descendantsOfType('destructor_name')[0];
        if (!name)
            name = definition.descendantsOfType('identifier')[0];
        if (!name)
            name = definition.descendantsOfType('operator_name')[0];

        if (definition.child(0).type == 'qualified_identifier') {
            classes = definition.child(0).text.split("::")
            classes.pop() // remove the identifier
            classes = classes.map(_class => _class.replace(/\s/g, ''))
        }

        let parameters = definition.descendantsOfType('parameter_list')[0]
            .descendantsOfType('parameter_declaration').map(parameter => {
                let identifier = parameter.descendantsOfType('identifier')
                let type
                let name = ''
                if (identifier.length != 0) {
                    // the parameter is named
                    type = parameter.text.substring(0, parameter.text.lastIndexOf(' ')).replace(/\s/g, '')                    
                    name = identifier[0].text
                } else
                    type = parameter.text.replace(/\s/g, '')
                return {type, name}
            })
        return {classes, name: name.text, parameters}
    })
    return functions
}

function getUnimplemented(declarations : Method[], definitions : Method[]) : Method[] {
    let unimplemented = []
    for (let i = 0; i < declarations.length; i++) {
        let found = false
        for (let j = 0; j < definitions.length; j++) {
            if (declarations[i].equals(definitions[j])) {
                // if (compareMethods(declarations[i], definitions[j])) {
                found = true
                break;
            }
        }
        if (!found) {
            unimplemented.push(declarations[i])
        }
    }
    return unimplemented
}

function getClassNode(node) {
    if (node.type == 'class_specifier' || node.type == 'struct_specifier') {
        if (node.parent) {
            let prev = getClassNode(node.parent);
            if (prev) {
                return prev.concat(node.descendantsOfType('type_identifier')[0])
            }
        }
        return [node.descendantsOfType('type_identifier')[0]]
        // TODO check if after class the first identifier is the class name
    }
    if (!node.parent)
        return null
        
    return getClassNode(node.parent)
}

// function compareMethods(method1, method2) {
//     if (method1.name != method2.name)
//         return false;

//     if (method1.classes.length != method2.classes.length)
//         return false;

//     for (let i = 0; i < method1.classes.length; i++) {
//         if (method1.classes[i] != method2.classes[i])
//             return false;
//     }

//     if (method1.parameters.length != method2.parameters.length)
//         return false;

//     for (let i = 0; i < method1.parameters.length; i++) {
//         if (method1.parameters[i].type != method2.parameters[i].type)
//             return false;
//     }

//     return true
// }

function x(node) {
    for (let i = 0; i < node.childCount; i++) {
        x(node.child(i))
    }
    // if (node.type == 'function_declarator') {
        console.log("'" + node.text + "'" + " '" + node.type + "'");
        // x(node)
    // }
}

function doesFileExist(path : string) {
    try {
        fs.accessSync(path)
        return true
    } catch {
        return false
    }
}

function headerFilePathToCPP(path : string) {
    // path = path.replace('headers\\', 'src\\');
    path = path.replace('internal/', '');
    return path.replace(/\.\w*$/, '.cpp');
}

// function methodToString(method) {
//     // TODO call constructor in case of inheritence
//     let res = method.returnType + ' '
//     for (let i = 0; i < method.classes.length; i++) {
//         res += method.classes[i] + '::'
//     }
//     res += method.name + '('
//     method.parameters.forEach((parameter, i) => {
//         res += parameter.originalType + ' '
//         let name = parameter.name
//         if (parameter.name == '')
//             name = 'p' + i
//         res += name
//         if (i != method.parameters.length - 1)
//             res += ', '
//     })
//     res += ') {\n\t\n}';
//     return res
// }

function parseHeaderAndCreateCPP(headerPath : string) {
    if (!doesFileExist(headerPath)) return;
    fs.readFile(headerPath, (err, data) => {
        if (!err) {
            const source = data.toString();
            const declarations = getHeaderFunctions(source)
            const cppFilePath = headerFilePathToCPP(headerPath)
            
            let definitions = []
            let str = ''
            if (doesFileExist(cppFilePath)) {
                let source = fs.readFileSync(cppFilePath).toString()
                definitions = getCPPFunctions(source)
                str += '\n'
            } else
                str += '#include "./internal/' + path.basename(headerPath) + '"\n\n'

            const unimplemented = getUnimplemented(declarations, definitions).filter(func => !func.isPureVirtual)
            if (unimplemented.length == 0) return

            str += unimplemented.map(func => func.toString()).join('\n\n')

            fs.appendFile(cppFilePath, str, () => {});
        }
    })
}

/**
 * The function that gets called by vscode. Writes a corresponding
 * cpp file for each header file included in activeFiles.
 * @param mainFile the active file- not used.
 * @param activeFiles the selected files.
 */
function createImplementation(mainFile : string, activeFiles) {
	// vscode.window.showInformationMessage('Hello World from CPP tools!');
    activeFiles.forEach(file => {
        let filePath = file.path
        parseHeaderAndCreateCPP(filePath)
    })
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "cpp-tools" is now active!');

	let disposable = vscode.commands.registerCommand('cpp-tools.create-implementation', createImplementation);

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
