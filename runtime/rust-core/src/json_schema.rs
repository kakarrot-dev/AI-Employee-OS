use serde_json::Value;

pub fn validate(schema: &Value, value: &Value) -> Result<(), String> {
    validate_at(schema, value, "$")
}

fn validate_at(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    if let Some(constant) = schema.get("const") {
        if value != constant {
            return Err(format!("{path}: value does not match const"));
        }
    }
    if let Some(allowed) = schema.get("enum").and_then(Value::as_array) {
        if !allowed.contains(value) {
            return Err(format!("{path}: unsupported value"));
        }
    }
    if let Some(expected) = schema.get("type").and_then(Value::as_str) {
        let valid = match expected {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
            "number" => value.is_number(),
            "boolean" => value.is_boolean(),
            "null" => value.is_null(),
            _ => return Err(format!("{path}: unsupported schema type {expected}")),
        };
        if !valid {
            return Err(format!("{path}: expected {expected}"));
        }
    }
    if let Some(text) = value.as_str() {
        let length = text.chars().count() as u64;
        if schema
            .get("minLength")
            .and_then(Value::as_u64)
            .is_some_and(|min| length < min)
        {
            return Err(format!("{path}: shorter than minLength"));
        }
        if schema
            .get("maxLength")
            .and_then(Value::as_u64)
            .is_some_and(|max| length > max)
        {
            return Err(format!("{path}: longer than maxLength"));
        }
    }
    if let Some(number) = value.as_f64() {
        if schema
            .get("minimum")
            .and_then(Value::as_f64)
            .is_some_and(|min| number < min)
        {
            return Err(format!("{path}: below minimum"));
        }
        if schema
            .get("maximum")
            .and_then(Value::as_f64)
            .is_some_and(|max| number > max)
        {
            return Err(format!("{path}: above maximum"));
        }
    }
    if let Some(object) = value.as_object() {
        let properties = schema.get("properties").and_then(Value::as_object);
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for field in required.iter().filter_map(Value::as_str) {
                if !object.contains_key(field) {
                    return Err(format!("{path}: missing required field {field}"));
                }
            }
        }
        if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
            let allowed = properties
                .ok_or_else(|| format!("{path}: closed object schema must declare properties"))?;
            if let Some(field) = object.keys().find(|field| !allowed.contains_key(*field)) {
                return Err(format!("{path}: unknown field {field}"));
            }
        }
        if let Some(properties) = properties {
            for (field, field_schema) in properties {
                if let Some(field_value) = object.get(field) {
                    validate_at(field_schema, field_value, &format!("{path}.{field}"))?;
                }
            }
        }
    }
    if let Some(items) = value.as_array() {
        let length = items.len() as u64;
        if schema
            .get("minItems")
            .and_then(Value::as_u64)
            .is_some_and(|min| length < min)
        {
            return Err(format!("{path}: fewer than minItems"));
        }
        if schema
            .get("maxItems")
            .and_then(Value::as_u64)
            .is_some_and(|max| length > max)
        {
            return Err(format!("{path}: more than maxItems"));
        }
        if let Some(item_schema) = schema.get("items") {
            for (index, item) in items.iter().enumerate() {
                validate_at(item_schema, item, &format!("{path}[{index}]"))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_nested_objects_and_arrays() {
        let schema = json!({"type":"object","additionalProperties":false,"required":["sources"],"properties":{"sources":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["url"],"properties":{"url":{"type":"string","minLength":1}}}}}});
        assert!(validate(&schema, &json!({"sources":[{"url":"https://example.com"}]})).is_ok());
        assert!(validate(&schema, &json!({"sources":"wrong"})).is_err());
        assert!(validate(&schema, &json!({"sources":[{"url":"","extra":true}]})).is_err());
    }
}
