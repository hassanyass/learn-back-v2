from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field

class KidoLearnedItem(BaseModel):
    point_id: str
    kido_sentence: str
    status: Literal["correct", "partial", "incorrect"]

class KidoPanelDTO(BaseModel):
    kido_learned_list: List[KidoLearnedItem]

class WidgetPayload(BaseModel):
    type: Literal["mcq", "sorting", "explanation", "correction", "text"]
    schema_def: dict[str, Any] = Field(alias="schema")
    state: dict[str, Any]

class WidgetSchemaDTO(BaseModel):
    widget_status: Literal["locked", "active"]
    widget_payload: Optional[WidgetPayload] = None

class MindMapNode(BaseModel):
    point: str
    kido_sentence: str
    status: Literal["correct", "partial", "incorrect"]

class MindMapData(BaseModel):
    topic_title: str
    nodes: List[MindMapNode]

class MindMapDTO(BaseModel):
    mind_map: str | MindMapData  # string for EMPTY_SAFE_FALLBACK

class HintDTO(BaseModel):
    hint_level: int
    hint_text: str
    bkt_penalty: float

class SessionInitDTO(BaseModel):
    session_status: str
    current_topic: dict[str, Any]
    current_point: dict[str, Any]
    kido_message: str

class EvaluatorResultDTO(BaseModel):
    kido_response: str
    widget_type: str
    session_state: dict[str, Any]
    advanced: bool
    session_complete: bool
    evaluation_label: str

class TopicTransitionDTO(BaseModel):
    mind_map_generated: bool
    new_topic_index: int
    session_complete: bool
