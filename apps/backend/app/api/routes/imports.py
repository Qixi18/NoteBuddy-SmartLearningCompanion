from pathlib import Path

from fastapi import APIRouter, Depends

from ..dependencies import get_use_cases
from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    ImportFilesRequest,
    ImportRequest,
    ImportResponse,
)

router = APIRouter()


def _response(result: dict) -> ImportResponse:
    parsing = result.get("source_parsing", {})
    files = parsing.get("files", {})
    return ImportResponse(
        run_id=result["run_id"],
        quality=result["quality"],
        source_parsing={
            key: parsing.get(key)
            for key in (
                "provider",
                "purpose",
                "status",
                "file_count",
                "parsed_file_count",
            )
        }
        | {
            "files": {
                name: {
                    key: metadata.get(key)
                    for key in ("status", "page_count", "reason", "parse_status")
                    if key in metadata
                }
                for name, metadata in files.items()
            }
        },
    )


@router.post("/api/import", response_model=ImportResponse, tags=["imports"])
def import_folder(
    payload: ImportRequest, use_cases: WorkbenchUseCases = Depends(get_use_cases)
) -> ImportResponse:
    result = use_cases.import_folder.execute(Path(payload.folder.strip()))
    return _response(result)


@router.post("/api/import-files", response_model=ImportResponse, tags=["imports"])
def import_files(
    payload: ImportFilesRequest, use_cases: WorkbenchUseCases = Depends(get_use_cases)
) -> ImportResponse:
    result = use_cases.import_folder.execute_files(payload.files, payload.pdf_files)
    return _response(result)


