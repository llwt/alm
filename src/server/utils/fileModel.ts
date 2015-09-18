import utils = require("../../common/utils");
import os = require('os');
import fsu = require('./fsu');
import fs = require('fs');

// TODO: support files not on disk
/**
 * Loads a file from disk or keeps it in memory 
 * watches it on fs and then if it changes sends the new content to the client
 * File is *always* saved to cache for recovery
 * 
 * Have a model like code mirror ... just use lines at all places ... till we actually write to disk
 */
export class FileModel {
    /** either the os default or whatever was read from the file */
    private newLine: string;
    private text: string[] = [];
    
    /** last known state of the file system text */
    private savedText: string[] = [];

    constructor(public config: {
        filePath: string;
        /** New content is only sent if the file has no pending changes. Otherwise it is silently ignored */
        savedFileChangedOnDisk: (content: string) => any;
    }) {
        let content = fsu.readFile(config.filePath);
        this.newLine = this.getExpectedNewline(content);

        this.savedText = this.text = this.splitlines(content);
        this.watchFile();
    }

    getContents() {
        return this.text.join('\n');
    }

    /** Returns true if the file is same as what was on disk */
    edit(codeEdit: CodeEdit): { saved: boolean } {
        let lastLine = this.text.length - 1;

        let beforeLines = this.text.slice(0, codeEdit.from.line);
        // there might not be any after lines. This just might be a new line :)
        let afterLines = codeEdit.to.line === lastLine ? [] : this.text.slice(codeEdit.to.line + 1, this.text.length);

        let lines = this.text.slice(codeEdit.from.line, codeEdit.to.line + 1);
        let content = lines.join('\n');
        let contentBefore = content.substr(0, codeEdit.from.ch);
        let contentAfter = lines[lines.length - 1].substr(codeEdit.to.ch);
        content = contentBefore + codeEdit.newText + contentAfter;
        lines = content.split('\n');

        this.text = beforeLines.concat(lines).concat(afterLines);

        return { saved: this.saved() };
    }

    save() {
        let content = this.text.join(this.newLine);
        fsu.writeFile(this.config.filePath, content);
        this.savedText = this.text;
    }

    saved(): boolean {
        return utils.arraysEqual(this.text, this.savedText);
    }

    close() {
        this.unwatchFile();
    }

    fileListener = () => {
        let content = fsu.readFile(this.config.filePath);
        let text = this.splitlines(content);
        let newTextSameAsSavedText = utils.arraysEqual(this.text, this.text);

        if (newTextSameAsSavedText) {
            return;
        }

        if (this.saved()) {
            this.text = text;
            this.savedText = this.text;
            this.config.savedFileChangedOnDisk(this.text.join(this.newLine));
        }
    };

    watchFile() {
        fs.watchFile(this.config.filePath, this.fileListener);
    }
    unwatchFile() {
        fs.unwatchFile(this.config.filePath, this.fileListener);
    }
    
    /** splitLinesAuto from codemirror */
    private splitlines(string: string) { return string.split(/\r\n?|\n/); };
    
    /** Couldn't find one online. Hopefully this is good enough */
    private getExpectedNewline(str: string) {
        let CR = str.match(/\r/g);
        let CRCount = CR ? CR.length : 0;
        let CRLF = str.match(/\r\n/g);
        let CRLFCount = CRLF ? CRLF.length : 0;

        return CRCount == 0
            ? os.EOL
            : CRCount > 1.5 * CRLFCount
                ? '\r'
                : '\r\n';
    }
}