const express = require('express');
const formidable = require('formidable');
const fs = require('fs/promises');
const app = express();
const PORT = 3000;
const EventEmitter = require('events');

// Increase default max listeners for EventEmitter
EventEmitter.defaultMaxListeners = 50;

const Timer = require('./Timer');
const CloneDetector = require('./CloneDetector');
const CloneStorage = require('./CloneStorage');
const FileStorage = require('./FileStorage');

const ProcessingStats = {
    fileStats: [],
    maxStoredStats: 1000, // Limit stored statistics
    addStats: function(fileName, lines, timers) {
        // Trim old stats if exceeding limit
        if (this.fileStats.length >= this.maxStoredStats) {
            this.fileStats = this.fileStats.slice(-Math.floor(this.maxStoredStats / 2));
        }

        const totalTime = Number(timers.total);
        this.fileStats.push({
            fileName,
            timestamp: Date.now(),
            lines,
            timers: {
                ...Object.fromEntries(
                    Object.entries(timers).map(([key, value]) => [key, Number(value)])
                )
            },
            normalizedTime: totalTime / lines
        });
    },
    getRecentStats: function(count = 10) {
        return this.fileStats.slice(-count);
    },
    getAverages: function() {
        if (!this.fileStats.length) return null;
        
        const sum = this.fileStats.reduce((acc, stat) => ({
            lines: acc.lines + stat.lines,
            normalizedTime: acc.normalizedTime + stat.normalizedTime
        }), { lines: 0, normalizedTime: 0 });
        
        return {
            avgLines: sum.lines / this.fileStats.length,
            avgNormalizedTime: sum.normalizedTime / this.fileStats.length
        };
    }
};

// Express and Formidable stuff to receice a file for further processing
// --------------------
// Create a single form instance with proper configuration
const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB limit
    keepExtensions: true,
    multiples: false,
    maxFields: 5,
    allowEmptyFiles: false
});

// Set max listeners for the form specifically
form.setMaxListeners(100);

// Add error handler to the form
form.on('error', err => {
    console.error('Form error:', err);
});

// Cleanup function to remove listeners
function cleanupFormListeners() {
    form.removeAllListeners('error');
    form.removeAllListeners('end');
}

app.post('/', fileReceiver );
function fileReceiver(req, res, next) {
    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            cleanupFormListeners();
            return res.status(500).end();
        }
        
        if (!files.data || !fields.name) {
            console.error('Missing required file or filename');
            cleanupFormListeners();
            return res.status(400).end();
        }

        fs.readFile(files.data.filepath, { encoding: 'utf8' })
            .then(data => processFile(fields.name, data))
            .catch(err => {
                console.error('Error processing file:', err);
                return res.status(500).end();
            })
            .finally(() => {
                cleanupFormListeners();
            });
            
        res.status(200).end();
    });
}

app.get('/', viewClones );

const server = app.listen(PORT, () => { console.log('Listening for files on port', PORT); });


// Page generation for viewing current progress
// --------------------
function getStatistics() {
    let cloneStore = CloneStorage.getInstance();
    let fileStore = FileStorage.getInstance();
    let output = 'Processed ' + fileStore.numberOfFiles + ' files containing ' + cloneStore.numberOfClones + ' clones.'
    return output;
}

function lastFileTimersHTML() {
    if (!lastFile) return '';
    output = '<p>Timers for last file processed:</p>\n<ul>\n'
    let timers = Timer.getTimers(lastFile);
    for (t in timers) {
        output += '<li>' + t + ': ' + (timers[t] / (1000n)) + ' µs\n'
    }
    output += '</ul>\n';
    return output;
}

function listClonesHTML() {
    let cloneStore = CloneStorage.getInstance();
    let output = '';

    cloneStore.clones.forEach( clone => {
        output += '<hr>\n';
        output += '<h2>Source File: ' + clone.sourceName + '</h2>\n';
        output += '<p>Starting at line: ' + clone.sourceStart + ' , ending at line: ' + clone.sourceEnd + '</p>\n';
        output += '<ul>';
        clone.targets.forEach( target => {
            output += '<li>Found in ' + target.name + ' starting at line ' + target.startLine + '\n';            
        });
        output += '</ul>\n'
        output += '<h3>Contents:</h3>\n<pre><code>\n';
        output += clone.originalCode;
        output += '</code></pre>\n';
    });

    return output;
}

function listProcessedFilesHTML() {
    let fs = FileStorage.getInstance();
    let output = '<HR>\n<H2>Processed Files</H2>\n'
    output += fs.filenames.reduce( (out, name) => {
        out += '<li>' + name + '\n';
        return out;
    }, '<ul>\n');
    output += '</ul>\n';
    return output;
}

function viewClones(req, res, next) {
    let page = '<HTML><HEAD>';
    page += '<TITLE>CodeStream Clone Detector</TITLE>';
    page += '<style>';
    page += 'table { border-collapse: collapse; width: 100%; }';
    page += 'th, td { border: 1px solid black; padding: 8px; text-align: left; }';
    page += '.stats-container { margin: 20px 0; padding: 10px; background: #f5f5f5; }';
    page += '</style>';
    page += '</HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector</H1>\n';
    
    // Basic statistics
    page += '<div class="stats-container">';
    page += '<H2>Overall Statistics</H2>';
    page += '<P>' + getStatistics() + '</P>';
    page += lastFileTimersHTML();
    page += '</div>';
    
    // Processing time trends
    page += '<div class="stats-container">';
    page += '<H2>Recent Processing Times</H2>';
    page += getProcessingTrendsHTML();
    page += '</div>';
    
    // Existing clone and file lists
    page += listClonesHTML() + '\n';
    page += listProcessedFilesHTML() + '\n';
    page += '</BODY></HTML>';
    res.send(page);
}

// Add new function for processing trends
function getProcessingTrendsHTML() {
    const recentStats = ProcessingStats.getRecentStats();
    const averages = ProcessingStats.getAverages();
    
    if (!recentStats.length) return '<p>No processing data available yet.</p>';
    
    let html = '<table>';
    html += '<tr><th>File</th><th>Lines</th><th>Processing Time (µs)</th><th>Time per Line (µs)</th></tr>';
    
    recentStats.forEach(stat => {
        html += `<tr>
            <td>${stat.fileName}</td>
            <td>${stat.lines}</td>
            <td>${(stat.timers.total / 1000).toFixed(2)}</td>
            <td>${(stat.normalizedTime / 1000).toFixed(2)}</td>
        </tr>`;
    });
    
    html += '</table>';
    
    if (averages) {
        html += `<p>Averages: ${averages.avgLines.toFixed(2)} lines/file, 
                ${averages.avgNormalizedTime.toFixed(2)} µs/line</p>`;
    }
    
    return html;
}

// Some helper functions
// --------------------
// PASS is used to insert functions in a Promise stream and pass on all input parameters untouched.
PASS = fn => d => {
    try {
        fn(d);
        return d;
    } catch (e) {
        throw e;
    }
};

const STATS_FREQ = 100;
const URL = process.env.URL || 'http://localhost:8080/';
var lastFile = null;

function maybePrintStatistics(file, cloneDetector, cloneStore) {
    if (0 == cloneDetector.numberOfProcessedFiles % STATS_FREQ) {
        console.log('Processed', cloneDetector.numberOfProcessedFiles, 'files and found', cloneStore.numberOfClones, 'clones.');
        let timers = Timer.getTimers(file);
        let str = 'Timers for last file processed: ';
        for (t in timers) {
            str += t + ': ' + (timers[t] / (1000n)) + ' µs '
        }
        console.log(str);
        console.log('List of found clones available at', URL);
    }

    return file;
}

// Processing of the file
// --------------------
function processFile(name, contents) {
    let file = {name: name, contents: contents};
    let cloneDetector = new CloneDetector();
    let cloneStore = CloneStorage.getInstance();
    
    Timer.start(file);
    
    return cloneDetector.preprocess(file)
        .then( file => {
            Timer.lap(file, 'preprocess');
            return cloneDetector.transform(file);
        })
        .then( PASS( file => Timer.lap(file, 'transform') ))
        .then( file => cloneDetector.matchDetect(file) )
        .then( PASS( file => Timer.lap(file, 'matchDetect') ))
        .then( file => {
            Timer.stop(file);
            // Add processing statistics
            ProcessingStats.addStats(
                file.name,
                file.lines.length,
                Timer.getTimers(file)
            );
            return file;
        })
        .then( file => cloneStore.storeClones(file) )
        .then( file => cloneDetector.storeFile(file) )
        .then( file => maybePrintStatistics(file, cloneDetector, cloneStore) )
        .catch( err => console.log('Error processing file:', err));
}

// Clean up temporary files after processing
form.on('end', () => {
    // Formidable will clean up temp files automatically
    console.log('Form processing completed');
});

// Clean up on server shutdown
process.on('SIGTERM', () => {
    cleanupFormListeners();
    server.close();
});

process.on('SIGINT', () => {
    cleanupFormListeners();
    server.close();
});

/*
1. Preprocessing: Remove uninteresting code, determine source and comparison units/granularities
2. Transformation: One or more extraction and/or transformation techniques are applied to the preprocessed code to obtain an intermediate representation of the code.
3. Match Detection: Transformed units (and/or metrics for those units) are compared to find similar source units.
4. Formatting: Locations of identified clones in the transformed units are mapped to the original code base by file location and line number.
5. Post-Processing and Filtering: Visualisation of clones and manual analysis to filter out false positives
6. Aggregation: Clone pairs are aggregated to form clone classes or families, in order to reduce the amount of data and facilitate analysis.
*/
