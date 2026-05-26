import json
from pathlib import Path

from flask import Flask, jsonify, render_template_string, request, url_for

from util import (
    get_app_data,
    predict_learning_outcome,
)


app = Flask(
    __name__,
    static_folder=str(Path(__file__).resolve().parent.parent / "static"),
    static_url_path="/static",
)


PAGE_TEMPLATE = """
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Civic Issue Severity Predictor</title>
        <link rel="stylesheet" href="{{ css_url }}">
        <script>
            window.APP_DATA = {{ app_data_json | safe }};
        </script>
        <script defer src="{{ js_url }}"></script>
    </head>
    <body></body>
</html>
"""


@app.get("/")
def index():
        app_data_json = json.dumps(get_app_data())
        return render_template_string(
                PAGE_TEMPLATE,
                app_data_json=app_data_json,
                css_url=url_for("static", filename="style.css"),
                js_url=url_for("static", filename="script.js"),
        )


@app.post("/predict")
def predict():
    payload = request.get_json(silent=True) or request.form.to_dict(flat=True)
    result = predict_learning_outcome(payload)
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)