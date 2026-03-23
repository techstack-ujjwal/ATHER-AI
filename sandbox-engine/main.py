import os
import json
import asyncio
import subprocess
from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Aether AI Sandbox Engine")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    # Fallback to prevent crash on boot without env vars
    supabase = None

class ExecutionRequest(BaseModel):
    execution_id: str
    workflow_id: str
    inputs: dict

async def run_sandboxed_code(code: str, inputs: dict) -> dict:
    # SECURITY NOTICE: In production, this should write 'code' to a temp file, 
    # then spin up a restricted container or thread, limiting CPU/Memory and Network.
    # For now, we mock the isolation by running it in a subprocess locally.
    
    # Example logic: writing an isolated script
    temp_script_path = f"/tmp/{os.urandom(8).hex()}.py"
    with open(temp_script_path, "w") as f:
        f.write("import json, sys\n")
        f.write("inputs = json.loads(sys.argv[1])\n")
        f.write("# WORKFLOW CODE INJECTED HERE\n")
        f.write(code)
        f.write("\n")
        f.write("print(json.dumps({'result': 'Success', 'message': 'Workflow executed in sandbox.'}))\n")

    try:
        # Run subprocess with a strict 60 second timeout
        process = await asyncio.create_subprocess_exec(
            "python", temp_script_path, json.dumps(inputs),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60.0)
        
        # Cleanup
        if os.path.exists(temp_script_path):
            os.remove(temp_script_path)
            
        logs = stderr.decode() + "\n" + stdout.decode()
        
        try:
            # Attempt to parse last line as JSON output
            output_lines = stdout.decode().strip().split("\n")
            output_json = json.loads(output_lines[-1])
        except Exception:
            output_json = {"raw_output": stdout.decode()}
            
        return {"status": "success", "output": output_json, "logs": logs}

    except asyncio.TimeoutError:
        try:
            process.kill()
        except Exception:
            pass
        return {"status": "failed", "output": {}, "logs": "[Error] Execution timeout (60s exceeded)"}
    except Exception as e:
        return {"status": "failed", "output": {}, "logs": f"[Error] Sandbox crash: {str(e)}"}

def update_execution_status(execution_id: str, payload: dict):
    if not supabase:
        print(f"Mock DB Update to {execution_id}: {payload}")
        return
        
    try:
        supabase.table("Execution").update(payload).eq("id", execution_id).execute()
    except Exception as e:
        print(f"Failed to update Supabase: {e}")

async def process_workflow(execution_id: str, workflow_id: str, inputs: dict):
    """Background task to fetch workflow, execute code, and write back to DB."""
    
    # 1. Update status to 'running'
    update_execution_status(execution_id, {"status": "running", "logs": "[System] Initializing Python Sandbox...\n"})
    
    if not supabase:
        await asyncio.sleep(2)
        code = "print('Mock code executing')"
    else:
        # 2. Fetch the actual Python code attached to this workflow
        response = supabase.table("Workflow").select("fileUrl").eq("id", workflow_id).execute()
        if not response.data or len(response.data) == 0:
            update_execution_status(execution_id, {"status": "failed", "logs": "[Error] Workflow file not found in database."})
            return
            
        # Normally you would fetch the .py file from the fileUrl Supabase Storage link here
        # For simplicity, we assume we fetch it and variable `code` contains the file's text.
        code = "# Mocked Python text downloaded from Storage"

    # 3. Execute
    update_execution_status(execution_id, {"logs": "[System] Injecting inputs and running script...\n"})
    result = await run_sandboxed_code(code, inputs)
    
    # 4. Save results back
    update_execution_status(execution_id, {
        "status": result["status"],
        "logs": result["logs"],
        "output": result["output"]
    })

@app.post("/api/workflows/run")
async def trigger_run(request: ExecutionRequest, background_tasks: BackgroundTasks, authorization: str = Header(None)):
    """
    Called by the React Frontend. Instantly returns a 202 Accepted, and processes in background.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization Header")
        
    if not supabase:
        print("Running in mocked local mode (No Supabase Env Vars)")
        
    # Queue the heavy sandbox execution so we don't block the request
    background_tasks.add_task(process_workflow, request.execution_id, request.workflow_id, request.inputs)
    
    return {"message": "Execution queued", "execution_id": request.execution_id, "status": "queued"}

@app.get("/")
def root():
    return {"service": "Aether AI Sandbox Engine", "status": "online", "version": "1.0.0"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "sandbox_engine": "online"}
