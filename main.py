from flask import Flask, render_template, send_from_directory

app = Flask(__name__)
app.debug = True

@app.route('/')
def index():
    return render_template('index.html')


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
