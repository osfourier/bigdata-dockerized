# MonitorTool Documentation

## Overview
The MonitorTool is a web-based monitoring system for tracking and visualizing the progress of the clone detection process in real-time. It provides interactive charts, statistics, and downloadable reports.

## Components

1. **Backend (Python/Flask)**
- `monitor.py`: Core monitoring logic and statistics collection
- `app.py`: Flask web server and API endpoints
- Integration with MongoDB for data collection

2. **Frontend (HTML/JavaScript)**
- Real-time charts using Chart.js
- Live statistics updates
- Report generation and export capabilities

## Features

1. **Real-time Visualization**
- Collection counts (files, chunks, candidates, clones)
- Processing rates over time
- Status updates and trends

2. **Statistics Dashboard**
- Current processing rates
- Total counts
- Trend analysis

3. **Data Export**
- CSV export of raw statistics
- JSON report with detailed analysis
- Downloadable processing summaries

## How to Start

1. **Using Docker Compose**

```bash
docker-compose -f all-at-once.yaml up --build
```

2. **Access the Interface**
- Open web browser
- Navigate to: `http://localhost:5001`
- Monitor interface updates every 5 seconds

3. **Download Reports**
- Click "Download Report" for JSON analysis
- Click "Download Raw Data" for CSV statistics

## API Endpoints

1. **Main Dashboard**
- `GET /`: Web interface
- `GET /api/stats`: Current statistics
- `GET /api/report`: Detailed analysis report
- `GET /api/export`: Download CSV data
