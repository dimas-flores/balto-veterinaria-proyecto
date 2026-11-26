<?php

/** Catálogo y stock de ejemplo: solo se crean una vez, sin pisar inventario. */
use Drupal\Core\Entity\Entity\EntityFormDisplay;
use Drupal\Core\Entity\Entity\EntityViewDisplay;
use Drupal\commerce_product\Entity\ProductType;
use Drupal\commerce_product\Entity\ProductVariationType;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;

if (\Drupal::state()->get('balto.seed.phase3.v1')) {
  require __DIR__ . '/import-catalog.php';
  echo "Catálogo revisado; se conservan los precios y existencias existentes.\n";
  return;
}
if (!ProductVariationType::load('vet_variation')) {
  ProductVariationType::create(['id' => 'vet_variation', 'label' => 'Producto BALTO', 'orderItemType' => 'default', 'generateTitle' => FALSE])->save();
}
if (!ProductType::load('vet_product')) {
  ProductType::create(['id' => 'vet_product', 'label' => 'Producto BALTO', 'variationTypes' => ['vet_variation'], 'multipleVariations' => FALSE, 'injectVariationFields' => TRUE])->save();
}

// Campos de Drupal editables desde Commerce, no datos incrustados en Twig.
$fields = [
  ['commerce_product', 'vet_product', 'field_description', 'text_long', 'Descripción', [], [], 1, TRUE],
  ['commerce_product', 'vet_product', 'field_category', 'entity_reference', 'Categoría', ['target_type' => 'taxonomy_term'], ['handler' => 'default:taxonomy_term', 'handler_settings' => ['target_bundles' => ['categorias_productos' => 'categorias_productos']]], 1, TRUE],
  ['commerce_product', 'vet_product', 'field_species', 'list_string', 'Especie', ['allowed_values' => ['perro' => 'Perro', 'gato' => 'Gato', 'otros' => 'Otros']], [], -1, TRUE],
  ['commerce_product', 'vet_product', 'field_photo', 'image', 'Imagen del producto', ['uri_scheme' => 'public', 'default_image' => ['uuid' => '', 'alt' => '', 'title' => '', 'width' => NULL, 'height' => NULL]], ['file_directory' => 'products', 'file_extensions' => 'png jpg jpeg webp', 'max_filesize' => '2 MB', 'alt_field' => TRUE, 'alt_field_required' => TRUE], 1, TRUE],
  ['commerce_product_variation', 'vet_variation', 'field_stock_level', 'commerce_stock_level', 'Existencias (movimientos)', [], [], 1, FALSE],
];
foreach ($fields as [$entity_type, $bundle, $name, $type, $label, $storage_settings, $settings, $cardinality, $required]) {
  if (!FieldStorageConfig::loadByName($entity_type, $name)) {
    FieldStorageConfig::create(['field_name' => $name, 'entity_type' => $entity_type, 'type' => $type, 'cardinality' => $cardinality, 'settings' => $storage_settings])->save();
  }
  if (!FieldConfig::loadByName($entity_type, $bundle, $name)) {
    FieldConfig::create(['field_name' => $name, 'entity_type' => $entity_type, 'bundle' => $bundle, 'label' => $label, 'required' => $required, 'settings' => $settings])->save();
  }
}

$form = EntityFormDisplay::load('commerce_product.vet_product.default') ?? EntityFormDisplay::create(['targetEntityType' => 'commerce_product', 'bundle' => 'vet_product', 'mode' => 'default', 'status' => TRUE]);
foreach ([
  'title' => 'string_textfield', 'field_description' => 'text_textarea',
  'field_category' => 'options_select', 'field_species' => 'options_buttons',
  'field_photo' => 'image_image', 'variations' => 'commerce_product_single_variation',
  'stores' => 'commerce_entity_select', 'status' => 'boolean_checkbox',
] as $name => $widget) {
  $form->setComponent($name, ['type' => $widget, 'weight' => count($form->getComponents())]);
}
$form->save();
$variation_form = EntityFormDisplay::load('commerce_product_variation.vet_variation.default') ?? EntityFormDisplay::create(['targetEntityType' => 'commerce_product_variation', 'bundle' => 'vet_variation', 'mode' => 'default', 'status' => TRUE]);
foreach (['title' => 'string_textfield', 'sku' => 'string_textfield', 'price' => 'commerce_price_default', 'field_stock_level' => 'commerce_stock_level_simple_transaction', 'status' => 'boolean_checkbox'] as $name => $widget) {
  $variation_form->setComponent($name, ['type' => $widget, 'weight' => count($variation_form->getComponents())]);
}
$variation_form->save();
$view = EntityViewDisplay::load('commerce_product.vet_product.default') ?? EntityViewDisplay::create(['targetEntityType' => 'commerce_product', 'bundle' => 'vet_product', 'mode' => 'default', 'status' => TRUE]);
$view->setComponent('variations', ['type' => 'commerce_add_to_cart', 'label' => 'hidden'])->save();
$cart_form = EntityFormDisplay::load('commerce_order_item.default.add_to_cart') ?? EntityFormDisplay::create(['targetEntityType' => 'commerce_order_item', 'bundle' => 'default', 'mode' => 'add_to_cart', 'status' => TRUE]);
$cart_form->setComponent('purchased_entity', ['type' => 'commerce_product_variation_title', 'weight' => 0])
  ->setComponent('quantity', ['type' => 'commerce_quantity', 'weight' => 1, 'settings' => ['step' => '1', 'min' => '1', 'max' => NULL]])->save();

\Drupal::configFactory()->getEditable('commerce_stock.service_manager')
  ->set('commerce_product_variation_vet_variation_service_id', 'local_stock')
  ->set('default_service_id', 'local_stock')->set('stock_events_plugin_id', 'core_stock_events')->save();
\Drupal::configFactory()->getEditable('commerce_stock.core_stock_events')
  ->set('core_stock_events_order_complete_event_type', 'placed')
  ->set('core_stock_events_order_cancel', TRUE)->set('core_stock_events_order_updates', FALSE)->save();
\Drupal::configFactory()->getEditable('commerce_stock_enforcement.settings')
  ->set('insufficient_stock_cart', 'La cantidad máxima disponible de %name es %qty.')
  ->set('insufficient_stock_add_to_cart_zero_in_cart', 'Solo hay %qty unidades disponibles; solicitaste %qty_asked.')
  ->set('insufficient_stock_add_to_cart_quantity_in_cart', 'Solo hay %qty unidades disponibles y ya tienes %qty_o en tu carrito.')->save();

require __DIR__ . '/import-catalog.php';

$title_block = \Drupal::entityTypeManager()->getStorage('block')->load('balto_page_title');
$visibility = $title_block->getVisibility();
$visibility['request_path']['pages'] = "<front>\n/tienda\n/product/*";
$title_block->setVisibilityConfig('request_path', $visibility['request_path'])->save();
\Drupal::state()->set('balto.seed.phase3.v1', TRUE);
echo "Fase 3: catálogo, imágenes, categorías y stock transaccional cargados.\n";
