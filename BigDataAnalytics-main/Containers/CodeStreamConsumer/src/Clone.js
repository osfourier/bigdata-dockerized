class Clone {

    constructor(sourceName, sourceStart, sourceEnd, targetName, targetStart, targetEnd) {
        this.sourceName = sourceName;
        this.sourceStart = sourceStart;
        this.sourceEnd = sourceEnd;
        
        this.targets = [{
            name: targetName,
            startLine: targetStart,
            endLine: targetEnd
        }];
    }

    equals(clone) {
        return this.sourceName == clone.sourceName &&
            this.sourceStart == clone.sourceStart &&
            this.sourceEnd == clone.sourceEnd;
    }

    addTarget(clone) {
        this.targets = this.targets.concat(clone.targets);
    }

    isNext(clone) {
        return this.sourceEnd + 1 === clone.sourceStart;
    }

    maybeExpandWith(clone) {
        if (this.isNext(clone)) {
            this.sourceEnd = clone.sourceEnd;
            this.targets = this.targets.map(target => ({
                ...target,
                endLine: target.endLine + (clone.sourceEnd - clone.sourceStart)
            }));
            return true;
        }
        return false;
    }
}

module.exports = Clone;
