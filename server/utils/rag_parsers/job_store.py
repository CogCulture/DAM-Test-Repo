"""
job_store.py - Persistent job state management for RAGPush web app.
Each job is stored as a JSON file on disk to survive server restarts.
"""
import os
import json
import uuid
import time

JOBS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)


def _job_path(job_id):
    return os.path.join(JOBS_DIR, f"{job_id}.json")


def create_job(files: list, source_type: str = "upload") -> dict:
    """Create a new job with a list of file paths to process."""
    job_id = str(uuid.uuid4())
    job = {
        "job_id": job_id,
        "source_type": source_type,  # 'upload' or 'gdrive'
        "status": "pending",          # pending | running | paused | done
        "created_at": time.time(),
        "updated_at": time.time(),
        "total_files": len(files),
        "completed_files": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_cost": 0.0,
        "files": [
            {
                "index": i,
                "path": f["path"],
                "name": f["name"],
                "gdrive_folder_id": f.get("gdrive_folder_id"),  # for Drive uploads
                "status": "pending",   # pending | processing | done | failed | skipped
                "output_path": None,
                "error": None,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost": 0.0,
            }
            for i, f in enumerate(files)
        ]
    }
    _save(job)
    return job


def get_job(job_id: str) -> dict | None:
    path = _job_path(job_id)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def list_jobs() -> list:
    jobs = []
    for fname in os.listdir(JOBS_DIR):
        if fname.endswith(".json"):
            job_id = fname[:-5]
            job = get_job(job_id)
            if job:
                jobs.append(job)
    return sorted(jobs, key=lambda x: x.get("created_at", 0), reverse=True)


def update_job_status(job_id: str, status: str):
    job = get_job(job_id)
    if job:
        job["status"] = status
        job["updated_at"] = time.time()
        _save(job)


def update_file_status(job_id: str, file_index: int, status: str,
                       output_path: str = None, error: str = None,
                       input_tokens: int = 0, output_tokens: int = 0, cost: float = 0.0):
    job = get_job(job_id)
    if not job:
        return
    for f in job["files"]:
        if f["index"] == file_index:
            f["status"] = status
            if output_path:
                f["output_path"] = output_path
            if error:
                f["error"] = error
            f["input_tokens"] = input_tokens
            f["output_tokens"] = output_tokens
            f["cost"] = cost
            break

    # Recalculate totals
    job["completed_files"] = sum(1 for f in job["files"] if f["status"] in ("done", "failed", "skipped"))
    job["total_input_tokens"] = sum(f.get("input_tokens", 0) for f in job["files"])
    job["total_output_tokens"] = sum(f.get("output_tokens", 0) for f in job["files"])
    job["total_cost"] = sum(f.get("cost", 0.0) for f in job["files"])
    job["updated_at"] = time.time()
    _save(job)


def get_next_pending_file(job_id: str) -> dict | None:
    """Returns the first file with status 'pending', or None if all done."""
    job = get_job(job_id)
    if not job:
        return None
    for f in job["files"]:
        if f["status"] == "pending":
            return f
    return None


def is_paused(job_id: str) -> bool:
    job = get_job(job_id)
    return job is not None and job.get("status") == "paused"


def _save(job: dict):
    with open(_job_path(job["job_id"]), "w") as f:
        json.dump(job, f, indent=2)
