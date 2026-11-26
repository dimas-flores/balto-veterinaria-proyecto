<?php

/**
 * Imports missing SKUs and preserves existing product and inventory records.
 */

use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;
use Drupal\commerce_price\Price;
use Drupal\commerce_product\Entity\Product;
use Drupal\commerce_product\Entity\ProductVariation;
use Drupal\commerce_stock_local\Entity\StockLocation;

$locations = \Drupal::entityTypeManager()->getStorage('commerce_stock_location')->loadByProperties(['name' => 'Almacén central BALTO']);
$location = $locations ? reset($locations) : StockLocation::create(['type' => 'default', 'name' => 'Almacén central BALTO', 'status' => 1, 'uid' => 1]);
if ($location->isNew()) {
  $location->save();
}
$stores = \Drupal\commerce_store\Entity\Store::loadMultiple();
$store = reset($stores);
if (!$store) {
  throw new \RuntimeException("No se encontró la tienda BALTO.");
}
$terms = \Drupal::entityTypeManager()->getStorage('taxonomy_term')->loadByProperties(['vid' => 'categorias_productos']);
$categories = [];
foreach ($terms as $term) {
  $categories[$term->label()] = $term->id();
}
$directory = 'public://products';
\Drupal::service('file_system')->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY);
$assets = is_dir(dirname(__DIR__) . '/assets') ? dirname(__DIR__) . '/assets' : dirname(__DIR__) . '/drupal/assets';
$stock = \Drupal::service('commerce_stock.service_manager');
$items = json_decode(file_get_contents(__DIR__ . '/data/products.json'), TRUE, 512, JSON_THROW_ON_ERROR);
foreach ($items as $item) {
  $existing = \Drupal::entityTypeManager()->getStorage('commerce_product_variation')->loadByProperties(['sku' => $item['sku']]);
  if ($existing) {
    // No duplicar ni reponer existencias si el instalador se ejecuta de nuevo.
    continue;
  }
  if (!isset($categories[$item['category']])) {
    throw new \RuntimeException('Categoría desconocida para ' . $item['sku']);
  }
  $transaction = \Drupal::database()->startTransaction();
  try {
    $file = \Drupal::service('file.repository')->writeData(file_get_contents($assets . '/products/' . $item['sku'] . '.png'), $directory . '/' . $item['sku'] . '.png', FileExists::Replace);
    $file->setPermanent();
    $file->save();
    $variation = ProductVariation::create(['type' => 'vet_variation', 'sku' => $item['sku'], 'title' => $item['name'], 'status' => 1, 'price' => new Price($item['price'], 'PEN')]);
    $variation->save();
    $product = Product::create([
      'type' => 'vet_product', 'title' => $item['name'], 'langcode' => 'es', 'uid' => 1, 'status' => 1,
      'stores' => [$store->id()], 'variations' => [$variation],
      'field_description' => ['value' => $item['description'], 'format' => 'plain_text'],
      'field_category' => ['target_id' => $categories[$item['category']]],
      'field_species' => array_map(static fn($species) => ['value' => $species], $item['species']),
      'field_photo' => ['target_id' => $file->id(), 'alt' => 'Ilustración referencial de ' . $item['name']],
    ]);
    $product->save();
    // Ya vinculado a la tienda: el gestor resuelve el contexto correctamente.
    if ($item['stock'] > 0) {
      $stock->receiveStock($variation, $location->id(), '', $item['stock'], NULL, 'PEN', 'Inventario inicial de ejemplo BALTO');
    }
    unset($transaction);
  }
  catch (\Throwable $error) {
    $transaction->rollBack();
    throw $error;
  }
}
