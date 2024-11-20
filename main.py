from flask import Flask, render_template, send_from_directory, request, jsonify
import json
from jsonschema import validate
import os

app = Flask(__name__)
app.debug = True

# Load the JSON schema
with open('hp2p-config-schema.json', 'r') as schema_file:
    config_schema = json.load(schema_file)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/validate-config', methods=['POST'])
def validate_config():
    if 'config' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['config']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.json'):
        return jsonify({'error': 'File must be JSON format'}), 400
    
    try:
        # Read the file content as string first
        file_content = file.read().decode('utf-8')
        config_data = json.loads(file_content)
        validate(instance=config_data, schema=config_schema)
        return jsonify({'success': True, 'config': config_data})
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON format'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/client')
def client():
    return render_template('client.html')


@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
