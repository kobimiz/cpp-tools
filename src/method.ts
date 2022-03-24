export class Method {
    private returnType : string
    private classes : string[]
    private name : string
    private parameters : Variable[]
    
    public isPureVirtual : boolean

    constructor(returnType: string, classes: string[], name: string, parameters : Variable[], isPureVirtual: boolean) {
        this.returnType = returnType
        this.classes = classes
        this.name = name
        this.parameters = parameters
        this.isPureVirtual = isPureVirtual
    }

    toString() {
        // TODO call constructor in case of inheritence
        let res = this.returnType + ' '
        for (let i = 0; i < this.classes.length; i++)
            res += this.classes[i] + '::'

        res += this.name + '('
        this.parameters.forEach((parameter, i) => {
            res += parameter.toString()
            if (i != this.parameters.length - 1)
                res += ', '
        })
        res += ') {\n\t\n}';
        return res
    }
    
    equals(another: Method) {
        if (this.name != another.name)
            return false;

        if (this.classes.length != another.classes.length)
            return false;

        for (let i = 0; i < this.classes.length; i++) {
            if (this.classes[i] != another.classes[i])
                return false;
        }

        if (this.parameters.length != another.parameters.length)
            return false;

        for (let i = 0; i < this.parameters.length; i++) {
            if (this.parameters[i].equals(another.parameters[i]))
                return false;
        }

        return true
    }
}

export class Variable {
    private name : string
    private type : string
    private displayType : string

    constructor(name : string, type: string, displayType: string) {
        this.name = name
        this.type = type
        this.displayType = displayType
    }

    toString() {
        return this.displayType + ' ' + this.name
    }

    getType() {
        return this.displayType
    }

    equals(another : Variable) {
        return this.type == another.type
    }
}