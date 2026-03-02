"""Basic pipeline elements for agent execution."""

from collections.abc import Sequence

from agentdojo.agent_pipeline.base_pipeline_element import BasePipelineElement
from agentdojo.functions_runtime import EmptyEnv, Env, FunctionsRuntime
from agentdojo.types import ChatMessage, ChatUserMessage, text_content_block_from_string


class SystemMessage(BasePipelineElement):
    """Adds a system message to the beginning of the conversation.
    
    Args:
        system_message: The system message text to add.
    """
    
    def __init__(self, system_message: str):
        self.system_message = system_message
    
    def query(
        self,
        query: str,
        runtime: FunctionsRuntime,
        env: Env = EmptyEnv(),
        messages: Sequence[ChatMessage] | None = None,
        extra_args: dict | None = None,
    ) -> tuple[str, FunctionsRuntime, Env, Sequence[ChatMessage], dict]:
        """Add system message if not already present."""
        if messages is None:
            messages = []
        if extra_args is None:
            extra_args = {}
        
        # Only add system message if there are no messages yet
        if not messages:
            system_msg = {
                "role": "system",
                "content": [text_content_block_from_string(self.system_message)]
            }
            messages = [system_msg]
        
        return query, runtime, env, messages, extra_args


class InitQuery(BasePipelineElement):
    """Initializes the pipeline with the user's query.
    
    Adds the user query as the first user message if not already present.
    """
    
    def query(
        self,
        query: str,
        runtime: FunctionsRuntime,
        env: Env = EmptyEnv(),
        messages: Sequence[ChatMessage] | None = None,
        extra_args: dict | None = None,
    ) -> tuple[str, FunctionsRuntime, Env, Sequence[ChatMessage], dict]:
        """Add user query to messages."""
        if messages is None:
            messages = []
        if extra_args is None:
            extra_args = {}
        
        # Check if we need to add the user query
        # Only add if query is not empty and messages don't already contain it
        if query and (not messages or messages[-1].get("role") != "user" or not any(
            c.get("content") == query for c in messages[-1].get("content", []) if c.get("type") == "text"
        )):
            user_message = ChatUserMessage(
                role="user",
                content=[text_content_block_from_string(query)]
            )
            messages = [*messages, user_message]
        
        return query, runtime, env, messages, extra_args
