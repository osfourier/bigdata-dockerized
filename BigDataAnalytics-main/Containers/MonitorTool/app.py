from flask import Flask, render_template, jsonify, send_file, make_response
from monitor import CloneDetectorMonitor
import threading
import time
import io
import zipfile
import os

app = Flask(__name__)
monitor = CloneDetectorMonitor()

# Background thread to update stats
def background_monitor():
    while True:
        monitor.update_stats()
        time.sleep(5)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats')
def get_stats():
    return jsonify({
        'counts': monitor.get_collection_counts(),
        'rates': monitor.get_processing_rates(),
        'updates': monitor.get_recent_updates(1000),
        'trends': monitor.get_trend_analysis()
    })

@app.route('/api/report')
def get_report():
    report = monitor.stats.generate_analysis_report()
    return jsonify(report)

@app.route('/api/export')
def export_stats():
    filenames = monitor.stats.export_raw_data()
    
    # Create a zip file in memory
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w') as zf:
        for filename in filenames:
            zf.write(filename)
            # Clean up the temporary file after adding to zip
            os.remove(filename)
    
    # Seek to beginning of the stream
    memory_file.seek(0)
    
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='monitor_stats.zip'
    )

@app.route('/api/report/<collection>')
def get_collection_report(collection):
    """Get report for a specific collection"""
    if collection not in ['files', 'chunks', 'candidates', 'clones']:
        return jsonify({'error': 'Invalid collection type'}), 400
        
    report = monitor.stats.generate_analysis_report()
    
    # Handle case when report is empty
    if not report['summary']['total_processed']:
        return jsonify({
            'summary': {
                'total_count': 0,
                'average_rate': {'avg_rate': 0, 'total_count': 0}
            },
            'analysis': {},
            'predictions': {}
        })
    
    collection_report = {
        'summary': {
            'total_count': report['summary']['total_processed'].get(collection, 0),
            'average_rate': report['summary']['average_rates'].get(collection, {})
        },
        'analysis': report['analysis'].get(f'{collection}_generation', {}),
        'predictions': {},
        'raw_data': report['raw_data'].get(collection, [])
    }
    
    # Add collection-specific predictions
    if collection == 'chunks':
        collection_report['predictions']['avg_chunks_per_file'] = report['predictions'].get('avg_chunks_per_file', 0)
    elif collection == 'clones':
        collection_report['predictions']['avg_clone_size'] = report['predictions'].get('avg_clone_size', 0)
    
    return jsonify(collection_report)

if __name__ == '__main__':
    # Start monitoring in background thread
    monitor_thread = threading.Thread(target=background_monitor, daemon=True)
    monitor_thread.start()
    app.run(host='0.0.0.0', port=5000) 