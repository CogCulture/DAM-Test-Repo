export function useSelected() {
  const route = useRoute();
  const selected = useState<string[]>("selected", () => []);

  const toggleSelected = (target: string | { id: string; multi?: boolean }, isMulti = false) => {
    const id = typeof target === "string" ? target : target.id;
    const multi = typeof target === "object" && target.multi !== undefined ? target.multi : isMulti;

    if (multi) {
      if (selected.value.includes(id)) {
        selected.value = selected.value.filter((i) => i !== id);
      } else {
        selected.value = [...selected.value, id];
      }
    } else {
      if (selected.value.length === 1 && selected.value[0] === id) {
        selected.value = [];
      } else {
        selected.value = [id];
      }
    }
  };

  const resetSelected = () => {
    selected.value = [];
  };

  watch(
    () => [route.path, route.params.id, route.params.bucket],
    resetSelected
  );
  return { selected, toggleSelected, resetSelected };
}
