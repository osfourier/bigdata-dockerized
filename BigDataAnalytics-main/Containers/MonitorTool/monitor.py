import pymongo
import time
from datetime import datetime
import os
from collections import deque
import json
import statistics
import csv

class CloneDetectorMonitor:
    def __init__(self):
        self.mongo_host = os.getenv('DBHOST', 'localhost')
        self.client = pymongo.MongoClient(f"mongodb://{self.mongo_host}:27017/")
        self.db = self.client.cloneDetector
        self.last_status_id = None
        self.stats = ProcessingStats()
        self.recent_updates = deque(maxlen=1000)  # Keep last 1000 updates
        
    def update_stats(self):
        """Update all monitoring statistics"""
        counts = self.get_collection_counts()
        self.stats.update(counts)
        self._update_status()
        
    def get_collection_counts(self):
        counts = {}
        for collection in ['files', 'chunks', 'candidates', 'clones']:
            counts[collection] = self.db[collection].count_documents({})
        return counts
    
    def get_processing_rates(self):
        """Get processing rates for visualization"""
        rates_data = {
            'timestamps': [],
            'collections': {},
        }
        
        for rate in self.stats.rates:  # Last 100 data points
            rates_data['timestamps'].append(rate['timestamp'])
            coll = rate['collection']
            if coll not in rates_data['collections']:
                rates_data['collections'][coll] = []
            rates_data['collections'][coll].append({
                'rate': rate['rate'],
                'total_items': rate['total_items']
            })
        
        return rates_data
    
    def get_recent_updates(self, limit=10):
        """Get recent status updates"""
        return list(self.recent_updates)[-limit:]
    
    def get_trend_analysis(self):
        return self.stats.get_trend_analysis()
        
    def _update_status(self):
        """Update status messages from database"""
        query = {}
        if self.last_status_id:
            query = {'_id': {'$gt': self.last_status_id}}
            
        updates = list(self.db.statusUpdates.find(query).sort('_id', 1))
        if updates:
            self.last_status_id = updates[-1]['_id']
            for update in updates:
                self.recent_updates.append({
                    'timestamp': update['timestamp'],
                    'message': update['message']
                })

    def generate_analysis_report(self):
        """Generate detailed analysis report"""
        if not any(self.detailed_stats.values()):
            return {
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'total_processed': {},
                    'average_rates': {}
                },
                'analysis': {},
                'predictions': {},
                'raw_data': []
            }

        # Generate predictions
        predictions = {}
        if self.detailed_stats['files'] and self.detailed_stats['chunks']:
            latest_files = self.detailed_stats['files'][-1]['count']
            latest_chunks = self.detailed_stats['chunks'][-1]['count']
            if latest_files > 0:
                predictions['avg_chunks_per_file'] = latest_chunks / latest_files
        
        if self.detailed_stats['candidates'] and self.detailed_stats['clones']:
            latest_candidates = self.detailed_stats['candidates'][-1]['count']
            latest_clones = self.detailed_stats['clones'][-1]['count']
            if latest_clones > 0:
                predictions['avg_clone_size'] = latest_candidates / latest_clones

        report = {
            'timestamp': datetime.now().isoformat(),
            'summary': self._generate_summary(),
            'analysis': self._analyze_processing_times(),
            'predictions': predictions,
            'raw_data': {
                coll: stats for coll, stats in self.detailed_stats.items() if stats
            }
        }
        return report

class ProcessingStats:
    def __init__(self):
        self.collections = ['files', 'chunks', 'candidates', 'clones']
        self.previous_counts = {coll: 0 for coll in self.collections}
        self.previous_times = {coll: None for coll in self.collections}
        self.rates = []
        # Separate detailed stats for each collection
        self.detailed_stats = {coll: [] for coll in self.collections}
        
    def update(self, current_counts):
        current_time = time.time()
        
        for collection in self.collections:
            # Only update if we have previous data for this collection
            if self.previous_times[collection] is not None:
                time_diff = current_time - self.previous_times[collection]
                count_diff = current_counts[collection] - self.previous_counts[collection]
                
                if count_diff > 0:
                    rate = count_diff / time_diff
                    
                    # Add to collection-specific detailed stats
                    stats_entry = {
                        'timestamp': datetime.fromtimestamp(current_time).isoformat(),
                        'time_diff': time_diff,
                        'count': current_counts[collection],
                        'count_diff': count_diff,
                        'rate': rate
                    }
                    self.detailed_stats[collection].append(stats_entry)
                    
                    # Add to rates list for visualization
                    self.rates.append({
                        'timestamp': current_time,
                        'collection': collection,
                        'rate': rate,
                        'total_items': current_counts[collection]
                    })
            
            # Update previous values for this collection
            self.previous_counts[collection] = current_counts[collection]
            self.previous_times[collection] = current_time

    def _generate_summary(self):
        """Generate summary statistics"""
        latest_counts = {coll: self.previous_counts[coll] for coll in self.collections}
        
        # Calculate average rates per collection
        rates_by_collection = {}
        for coll in self.collections:
            coll_stats = self.detailed_stats[coll]
            if coll_stats:
                rates = [entry['rate'] for entry in coll_stats]
                rates_by_collection[coll] = {
                    'avg_rate': statistics.mean(rates),
                    'total_count': latest_counts[coll]
                }
            else:
                rates_by_collection[coll] = {
                    'avg_rate': 0,
                    'total_count': latest_counts[coll]
                }

        return {
            'total_processed': latest_counts,
            'average_rates': rates_by_collection
        }

    def _analyze_processing_times(self):
        """Analyze processing time trends"""
        analysis = {}
        
        for collection in self.collections:
            coll_stats = self.detailed_stats[collection]
            if coll_stats:
                rates = [entry['rate'] for entry in coll_stats]
                analysis[f'{collection}_generation'] = self._analyze_trend(rates)
            else:
                analysis[f'{collection}_generation'] = "Insufficient data"
        
        return analysis

    def _analyze_trend(self, rates):
        """Analyze trend in processing rates"""
        if not rates or len(rates) < 2:
            return "Insufficient data"
            
        rates = [r for r in rates if r > 0]
        if not rates:
            return "No valid rates"
            
        avg_rate = statistics.mean(rates)
        trend = "increasing" if rates[-1] > rates[0] else "decreasing"
        
        # Check if trend is linear or exponential
        mid_idx = len(rates) // 2
        mid_rate = rates[mid_idx]
        expected_linear = (rates[0] + rates[-1]) / 2
        pattern = "linear" if abs(mid_rate - expected_linear) < abs(mid_rate - (rates[0] * rates[-1])**0.5) else "exponential"
        
        return {
            'average_rate': avg_rate,
            'trend': trend,
            'pattern': pattern
        }

    def export_raw_data(self, base_filename='monitor_stats'):
        """Export raw statistics to separate CSV files for each collection"""
        if not any(self.detailed_stats.values()):
            return "No data to export"
            
        filenames = []
        for collection in self.collections:
            if self.detailed_stats[collection]:
                filename = f'{base_filename}_{collection}.csv'
                with open(filename, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=[
                        'timestamp', 
                        'time_diff', 
                        'count',
                        'count_diff',
                        'rate'
                    ])
                    writer.writeheader()
                    writer.writerows(self.detailed_stats[collection])
                filenames.append(filename)
        
        return filenames

    def get_trend_analysis(self):
        """Get trend analysis for visualization"""
        if not any(self.detailed_stats.values()):
            return {}
            
        analysis = self._analyze_processing_times()
        
        # Convert the analysis into a format suitable for display
        trends = {}
        for collection, data in analysis.items():
            if isinstance(data, dict):
                trends[collection] = f"Processing rate is {data['trend']} and appears to be {data['pattern']} " \
                                   f"(average rate: {data['average_rate']:.2f}/s)"
            else:
                trends[collection] = data
                
        return trends

    def generate_analysis_report(self):
        """Generate detailed analysis report"""
        if not any(self.detailed_stats.values()):
            return {
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'total_processed': {},
                    'average_rates': {}
                },
                'analysis': {},
                'predictions': {},
                'raw_data': []
            }

        # Generate predictions
        predictions = {}
        if self.detailed_stats['files'] and self.detailed_stats['chunks']:
            latest_files = self.detailed_stats['files'][-1]['count']
            latest_chunks = self.detailed_stats['chunks'][-1]['count']
            if latest_files > 0:
                predictions['avg_chunks_per_file'] = latest_chunks / latest_files
        
        if self.detailed_stats['candidates'] and self.detailed_stats['clones']:
            latest_candidates = self.detailed_stats['candidates'][-1]['count']
            latest_clones = self.detailed_stats['clones'][-1]['count']
            if latest_clones > 0:
                predictions['avg_clone_size'] = latest_candidates / latest_clones

        report = {
            'timestamp': datetime.now().isoformat(),
            'summary': self._generate_summary(),
            'analysis': self._analyze_processing_times(),
            'predictions': predictions,
            'raw_data': {
                coll: stats for coll, stats in self.detailed_stats.items() if stats
            }
        }
        return report

if __name__ == "__main__":
    monitor = CloneDetectorMonitor()
    monitor.monitor() 