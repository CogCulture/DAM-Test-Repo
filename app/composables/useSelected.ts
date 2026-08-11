export function useSelected() {
  const route = useRoute();
  const selected = useState<string[]>("selected", () => []);

  const toggleSelected = (id: string) => {
    if (selected.value.includes(id)) {
      selected.value = selected.value.filter((i) => i !== id);
    } else {
      selected.value.push(id);
    }
  };
  const resetSelected = () => {
    selected.value = [];
  };

  watch(() => route.params.id, resetSelected);
  return { selected, toggleSelected, resetSelected };
};
