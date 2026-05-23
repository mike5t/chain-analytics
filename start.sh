#!/bin/bash
# Chain Analytics — start everything

cd "$(dirname "$0")"
source venv/bin/activate

echo "Starting dashboard..."
nohup streamlit run dashboard/app.py --server.port 8501 --server.headless true > /tmp/streamlit.log 2>&1 &

echo "Starting API..."
nohup uvicorn api.main:app --port 8000 --reload > /tmp/api.log 2>&1 &

sleep 4
echo ""
echo "  Dashboard : http://localhost:8501"
echo "  API docs  : http://localhost:8000/docs"
echo ""
echo "To share publicly:"
echo "  ./ngrok http 8501"
