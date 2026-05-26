from functools import lru_cache
from pathlib import Path
import pickle

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model_pickel.plk"
LOCAL_DATASET_PATH = BASE_DIR / "civic_issue_dataset.csv"
FALLBACK_DATASET_PATH = BASE_DIR.parent / "Day-6" / "civic_issue_dataset.csv"
TARGET_COLUMN = "Severity_Label"
ID_COLUMN = "Report_ID"

# categorical features present in the civic dataset
CATEGORICAL_COLUMNS = [
    "Issue_Type",
    "Department",
    "Zone",
]

# boolean-like columns
BINARY_COLUMNS = ["Has_Photo", "Has_Voice_Note"]

# numeric columns present in the civic dataset
NUMERIC_COLUMNS = [
    "Hour_of_Day",
    "Severity_Score",
    "Num_Upvotes",
    "Population_Density",
    "Dept_Current_Workload",
    "Weather_Severity_Index",
    "Priority_Score",
    "Resolution_Time_Hours",
    "Citizen_Satisfaction_Score",
]

FIELD_SECTIONS = [
    {
        "title": "Incident",
        "description": "Basic incident metadata used by the model.",
        "fields": [
            {"name": "Issue_Type", "label": "Issue Type", "kind": "select"},
            {"name": "Department", "label": "Department", "kind": "select"},
            {"name": "Zone", "label": "Zone", "kind": "select"},
        ],
    },
    {
        "title": "Evidence",
        "description": "Multimedia indicators",
        "fields": [
            {"name": "Has_Photo", "label": "Has Photo", "kind": "binary"},
            {"name": "Has_Voice_Note", "label": "Has Voice Note", "kind": "binary"},
        ],
    },
    {
        "title": "Context",
        "description": "Numeric contextual features",
        "fields": [
            {"name": "Hour_of_Day", "label": "Hour of Day", "kind": "number", "step": 1},
            {"name": "Severity_Score", "label": "Severity Score", "kind": "number", "step": 1},
            {"name": "Num_Upvotes", "label": "Num Upvotes", "kind": "number", "step": 1},
            {"name": "Population_Density", "label": "Population Density", "kind": "number", "step": 1},
            {"name": "Dept_Current_Workload", "label": "Dept Current Workload", "kind": "number", "step": 1},
            {"name": "Weather_Severity_Index", "label": "Weather Severity Index", "kind": "number", "step": 1},
            {"name": "Priority_Score", "label": "Priority Score", "kind": "number", "step": 0.01},
            {"name": "Resolution_Time_Hours", "label": "Resolution Time Hours", "kind": "number", "step": 0.1},
            {"name": "Citizen_Satisfaction_Score", "label": "Citizen Satisfaction Score", "kind": "number", "step": 0.1},
        ],
    },
]


def get_dataset_path() -> Path:
    if LOCAL_DATASET_PATH.exists():
        return LOCAL_DATASET_PATH
    return FALLBACK_DATASET_PATH


@lru_cache(maxsize=1)
def load_training_frame() -> pd.DataFrame:
    return pd.read_csv(get_dataset_path())


@lru_cache(maxsize=1)
def load_model():
    with open(MODEL_PATH, "rb") as file:
        return pickle.load(file)


@lru_cache(maxsize=1)
def get_feature_columns() -> list[str]:
    # Prefer feature names from the saved model if available; otherwise derive from the dataset
    try:
        model = load_model()
    except Exception:
        model = None

    if model is not None:
        feature_names = getattr(model, "feature_names_in_", None)
        if feature_names is not None:
            return list(feature_names)

    frame = load_training_frame()
    raw_features = frame.drop(columns=[ID_COLUMN, TARGET_COLUMN], errors='ignore')
    encoded = pd.get_dummies(raw_features, columns=CATEGORICAL_COLUMNS, drop_first=True)
    return encoded.columns.tolist()


@lru_cache(maxsize=1)
def get_category_levels() -> dict[str, list[str]]:
    frame = load_training_frame()
    return {
        column: sorted(frame[column].dropna().astype(str).unique().tolist())
        for column in CATEGORICAL_COLUMNS
    }


@lru_cache(maxsize=1)
def get_default_values() -> dict[str, float | int | str]:
    frame = load_training_frame()
    defaults: dict[str, float | int | str] = {}

    for column in CATEGORICAL_COLUMNS:
        mode = frame[column].mode(dropna=True)
        defaults[column] = str(mode.iloc[0]) if not mode.empty else get_category_levels()[column][0]

    for column in BINARY_COLUMNS:
        mode = pd.to_numeric(frame[column], errors="coerce").mode(dropna=True)
        defaults[column] = int(mode.iloc[0]) if not mode.empty else 0

    for column in NUMERIC_COLUMNS:
        values = pd.to_numeric(frame[column], errors="coerce").dropna()
        defaults[column] = float(values.median()) if not values.empty else 0.0

    return defaults


def get_model_name() -> str:
    return type(load_model()).__name__


def get_app_data() -> dict[str, object]:
    return {
        "fieldSections": FIELD_SECTIONS,
        "categoryLevels": get_category_levels(),
        "defaults": get_default_values(),
        "modelName": get_model_name(),
        "datasetPath": str(get_dataset_path()),
        "targetColumn": TARGET_COLUMN,
    }


def _to_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_binary(value, default: int = 0) -> int:
    if isinstance(value, bool):
        return int(value)

    if value is None:
        return default

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return 1
    if normalized in {"0", "false", "no", "n", "off"}:
        return 0

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def build_sample_frame(payload: dict) -> pd.DataFrame:
    defaults = get_default_values()
    record: dict[str, float | int | str] = {}

    for column in CATEGORICAL_COLUMNS:
        record[column] = str(payload.get(column, defaults[column]))

    for column in BINARY_COLUMNS:
        record[column] = _to_binary(payload.get(column, defaults[column]), int(defaults[column]))

    for column in NUMERIC_COLUMNS:
        record[column] = _to_float(payload.get(column, defaults[column]), float(defaults[column]))

    sample = pd.DataFrame([record])

    for column in CATEGORICAL_COLUMNS:
        sample[column] = pd.Categorical(sample[column].astype(str), categories=get_category_levels()[column])

    encoded = pd.get_dummies(sample, columns=CATEGORICAL_COLUMNS, drop_first=True)
    return encoded.reindex(columns=get_feature_columns(), fill_value=0)


def predict_learning_outcome(payload: dict) -> dict:
    model = load_model()
    sample = build_sample_frame(payload)
    prediction = model.predict(sample)[0]
    probabilities = model.predict_proba(sample)[0]
    class_probabilities = {
        str(class_name): float(probability)
        for class_name, probability in zip(model.classes_, probabilities, strict=True)
    }

    ranked = sorted(class_probabilities.items(), key=lambda item: item[1], reverse=True)
    return {
        "prediction": str(prediction),
        "probabilities": dict(ranked),
        "confidence": float(ranked[0][1]) if ranked else 0.0,
    }