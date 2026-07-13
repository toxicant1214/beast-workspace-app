import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

response = (
    supabase
    .table("todo_items")
    .select("*")
    .execute()
)

print(f"共找到 {len(response.data)} 筆資料\n")

for task in response.data:
    print(task["title"])