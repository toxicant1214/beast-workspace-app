import { supabase } from "../lib/supabase";

export async function getTodos() {
  const { data, error } = await supabase
    .from("todo_items")
    .select("*")
    .eq("is_done", false)
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getCompletedTodos() {
  const { data, error } = await supabase
    .from("todo_items")
    .select("*")
    .eq("is_done", true)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addTodo({
  title,
  priority = "normal",
  assignee = null,
  deadline_at = null,
  has_time = false,
  reminder_offsets = [],
}) {
  const { error } = await supabase.from("todo_items").insert([
    {
      title,
      priority,
      assignee,
      deadline_at,
      has_time,
      reminder_offsets,
    },
  ]);

  if (error) throw error;
}

export async function completeTodo(id) {
  const { error } = await supabase
    .from("todo_items")
    .update({
      is_done: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteTodo(id) {
  const { error } = await supabase.from("todo_items").delete().eq("id", id);

  if (error) throw error;
}
export async function reopenTodo(id) {
  const { error } = await supabase
    .from("todo_items")
    .update({
      is_done: false,
      completed_at: null,
    })
    .eq("id", id);

  if (error) throw error;
}
export async function updateTodo(id, updates) {
  const { error } = await supabase
    .from("todo_items")
    .update(updates)
    .eq("id", id);

  if (error) throw error;
}