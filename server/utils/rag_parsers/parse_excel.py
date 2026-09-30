import os
import time
import argparse
import pandas as pd
import numpy as np
import json
import anthropic

def get_summaries(sheet_summaries, anthropic_key, model_name):
    print(f"Generating high-level summaries using Anthropic model: {model_name}...")
    client = anthropic.Anthropic(api_key=anthropic_key)
    
    prompt = f"""You are an expert data analyst. I am providing you with a high-level overview and a small sample of data from an Excel file containing multiple sub-tables.
Please provide exactly TWO sections:
1. Overall Summary: A brief summary of what the entire dataset represents.
2. Page-Wise Summary: A brief summary for each table based on its columns, context metadata, and sample data.

Do not include any other sections. Output in clear Markdown format.

Here is the data context:
{sheet_summaries}
"""
    try:
        response = client.messages.create(
            model=model_name, 
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        return response.content[0].text, response.usage.input_tokens, response.usage.output_tokens
    except Exception as e:
        return f"*Error generating summary: {e}*", 0, 0

def get_all_templates(tables_info_dict, anthropic_key, model_name):
    print("Generating natural language templates for all tables in a single API call...")
    client = anthropic.Anthropic(api_key=anthropic_key)
    
    prompt = f"""You are a linguistic expert. I have an Excel file with multiple sub-tables.
Some tables might be structured as matrices with both vertical and horizontal headers.
For each sub-table, I provide its name, its extracted metadata (any title or context rows that appeared before the table), and the list of columns.
Please write a single, natural-sounding, grammatically correct English sentence template for EACH table that connects all its columns logically based on the context. 
If there is metadata provided, intelligently infer its meaning and weave it into the sentence smoothly to provide better context.

Use EXACTLY the column names wrapped in curly braces as placeholders (e.g. {{Column Name}}).

Output ONLY a raw JSON dictionary where the keys are the table names and the values are the template strings. Do not use markdown blocks.

Here is the data:
{json.dumps(tables_info_dict, indent=2)}
"""
    try:
        response = client.messages.create(
            model=model_name, 
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        content = response.content[0].text.strip()
        if content.startswith("```json"):
            content = content.replace("```json", "", 1)
        elif content.startswith("```"):
            content = content.replace("```", "", 1)
        if content.endswith("```"):
            content = content[:-3]
            
        return json.loads(content.strip()), response.usage.input_tokens, response.usage.output_tokens
    except Exception as e:
        print(f"Failed to generate templates via LLM: {e}")
        return {table: " and ".join([f"{{{col}}}" for col in info['columns']]) + "." for table, info in tables_info_dict.items()}, 0, 0

def dedup_columns(cols):
    counts = {}
    new_cols = []
    for c in cols:
        name = str(c).strip() if pd.notna(c) and str(c).strip() else "Unnamed"
        if name in counts:
            counts[name] += 1
            new_cols.append(f"{name}_{counts[name]}")
        else:
            counts[name] = 0
            new_cols.append(name)
    return new_cols

def extract_sub_tables(df, sheet_name):
    # Ensure fully string for regex replace to avoid warnings
    df = df.astype(str).replace(r'^\s*$', np.nan, regex=True).replace('nan', np.nan)
    
    col_is_empty = df.isna().all(axis=0)
    col_blocks = []
    current_block = []
    
    for i, is_empty in enumerate(col_is_empty):
        if is_empty:
            if current_block:
                col_blocks.append(current_block)
                current_block = []
        else:
            current_block.append(i)
            
    if current_block:
        col_blocks.append(current_block)
        
    tables = []
    table_index = 1
    
    for block in col_blocks:
        sub_df = df.iloc[:, block].copy()
        row_is_empty = sub_df.isna().all(axis=1)
        row_blocks = []
        curr_row_block = []
        
        for i, is_empty in enumerate(row_is_empty):
            if is_empty:
                if curr_row_block:
                    row_blocks.append(curr_row_block)
                    curr_row_block = []
            else:
                curr_row_block.append(i)
                
        if curr_row_block:
            row_blocks.append(curr_row_block)
            
        for r_block in row_blocks:
            if len(r_block) >= 2:
                table_df = sub_df.iloc[r_block].copy()
                table_df = table_df.reset_index(drop=True)
                
                # Identify header row by finding the row with maximum non-nulls in the top 5 rows
                top_rows = table_df.head(5)
                non_null_counts = top_rows.notna().sum(axis=1)
                best_header_idx = non_null_counts.idxmax()
                
                # Extract metadata from rows before the header
                metadata_str = ""
                if best_header_idx > 0:
                    meta_list = []
                    for _, mr in table_df.iloc[:best_header_idx].iterrows():
                        vals = mr.dropna().astype(str).tolist()
                        if vals:
                            meta_list.append(" ".join(vals))
                    metadata_str = " | ".join(meta_list)
                
                table_df.columns = table_df.iloc[best_header_idx]
                table_df = table_df.iloc[best_header_idx + 1:]
                table_df = table_df.reset_index(drop=True)
                table_df = table_df.dropna(axis=1, how='all')
                table_df = table_df.dropna(axis=0, how='all')
                
                if len(table_df.columns) > 0 and not table_df.empty:
                    table_df.columns = dedup_columns(table_df.columns)
                    tables.append({
                        'name': f"{sheet_name}_Table{table_index}",
                        'metadata': metadata_str,
                        'df': table_df,
                        'columns': table_df.columns.tolist()
                    })
                    table_index += 1
                    
    return tables

def process_excel_fast(file_path, anthropic_key, model_name):
    print(f"Reading Excel file locally: {file_path}...")
    try:
        xls = pd.ExcelFile(file_path)
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        return
    
    sheet_samples = ""
    row_relations_text = "## 3. Row-by-Row Entity Relations\n\n"
    
    valid_tables = {}
    
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
        extracted_tables = extract_sub_tables(df, sheet_name)
        
        for t in extracted_tables:
            valid_tables[t['name']] = t
            
    if not valid_tables:
        print("No valid tables found.")
        return
        
    # Prepare info dictionary for LLM template generation
    tables_info_dict = {}
    for name, data in valid_tables.items():
        tables_info_dict[name] = {
            'columns': data['columns'],
            'metadata': data['metadata']
        }
    
    templates, t_in, t_out = get_all_templates(tables_info_dict, anthropic_key, model_name)
    time.sleep(3)
    
    for table_name, data in valid_tables.items():
        df = data['df']
        columns = data['columns']
        metadata = data['metadata']
        
        sheet_samples += f"### Table: {table_name}\n"
        if metadata:
            sheet_samples += f"Metadata/Context: {metadata}\n"
        sheet_samples += f"Columns: {', '.join(str(c) for c in columns)}\n"
        sheet_samples += "Sample Data (first 3 rows):\n"
        try:
            sheet_samples += df.head(3).to_markdown(index=False) + "\n\n"
        except Exception:
            sheet_samples += df.head(3).to_string(index=False) + "\n\n"
        
        template = templates.get(table_name, " and ".join([f"{{{col}}}" for col in columns]) + ".")
        
        row_relations_text += f"### **{table_name}**\n"
        for index, row in df.iterrows():
            row_sentence = template
            for col in columns:
                val = row[col]
                val_str = str(val) if pd.notna(val) else "N/A"
                row_sentence = row_sentence.replace(f"{{{col}}}", val_str)
                
            row_relations_text += f"- {row_sentence}\n"
        row_relations_text += "\n"
        
    summaries, s_in, s_out = get_summaries(sheet_samples, anthropic_key, model_name)
    final_content = f"# Data Intelligence Report\n\n{summaries}\n\n---\n\n{row_relations_text}"
    
    output_file = f"{os.path.splitext(file_path)[0]}_fast_parsed.md"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(final_content)
        
    print(f"Process complete! Output saved to '{output_file}'")
    
    total_in = t_in + s_in
    total_out = t_out + s_out
    cost = (total_in * 3.0 + total_out * 15.0) / 1_000_000
    
    return {"output_path": output_file, "input_tokens": total_in, "output_tokens": total_out, "cost": cost}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fast Excel parsing and intelligence generation.")
    parser.add_argument("file_path", help="Path to the Excel file")
    args = parser.parse_args()
    
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
    CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
    
    if not os.path.exists(args.file_path):
        print(f"Error: File '{args.file_path}' not found.")
    else:
        process_excel_fast(args.file_path, ANTHROPIC_API_KEY, CLAUDE_MODEL)
