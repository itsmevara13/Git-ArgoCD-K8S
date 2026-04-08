import { useState, useEffect } from 'react';

const API = '/api/todos';

export default function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    fetch(API).then(r => r.json()).then(setTodos);
  }, []);

  const add = async () => {
    if (!text.trim()) return;
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const todo = await res.json();
    setTodos([todo, ...todos]);
    setText('');
  };

  const toggle = async (id, done) => {
    const res = await fetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !done })
    });
    const updated = await res.json();
    setTodos(todos.map(t => t._id === id ? updated : t));
  };

  const remove = async (id) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    setTodos(todos.filter(t => t._id !== id));
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Todo App — K8s GitOps</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add a task..."
          style={{ flex: 1, padding: '10px 14px', fontSize: 16, borderRadius: 8,
            border: '1px solid #ddd', outline: 'none' }}
        />
        <button onClick={add}
          style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}>
          Add
        </button>
      </div>
      {todos.map(todo => (
        <div key={todo._id} style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: '#f9f9f9', borderRadius: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={todo.done}
            onChange={() => toggle(todo._id, todo.done)}
            style={{ width: 18, height: 18, cursor: 'pointer' }} />
          <span style={{ flex: 1, fontSize: 16,
            textDecoration: todo.done ? 'line-through' : 'none',
            color: todo.done ? '#aaa' : '#222' }}>
            {todo.text}
          </span>
          <button onClick={() => remove(todo._id)}
            style={{ background: 'none', border: 'none', color: '#e55',
              fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>
            x
          </button>
        </div>
      ))}
      {todos.length === 0 && (
        <p style={{ color: '#aaa', textAlign: 'center' }}>No tasks yet. Add one above.</p>
      )}
    </div>
  );
}